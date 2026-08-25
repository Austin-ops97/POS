/**
 * Run Prisma CLI against Neon's direct (non-pooler) database endpoint.
 *
 * Prisma migrate uses session advisory locks (pg_advisory_lock), which Neon
 * PgBouncer pooler endpoints do not support. That produces P1002 timeouts when
 * DATABASE_URL points at a `*-pooler.*` host.
 *
 * This wrapper only affects the Prisma CLI subprocess. The Next.js app should
 * continue using the pooled DATABASE_URL at runtime.
 */
import { spawnSync } from "node:child_process";
import { envWithLocalOverrides } from "./apply-env-local.mjs";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-with-direct.mjs <prisma args...>");
  process.exit(1);
}

// Precedence: process.env, then .env / .env.local for empty or CI placeholder values.
const mergedEnv = envWithLocalOverrides();

const databaseUrl = String(mergedEnv.DATABASE_URL ?? "").trim();
const explicitDirect = String(mergedEnv.DIRECT_URL ?? "").trim();
const derivedDirect = databaseUrl
  ? databaseUrl.replace("-pooler.", ".")
  : "";
const directUrl = explicitDirect || derivedDirect || databaseUrl;

if (!directUrl) {
  console.error(
    "No database connection string found. Set DATABASE_URL and DIRECT_URL."
  );
  console.error(
    "DATABASE_URL should use the Neon pooled host; DIRECT_URL must use the non-pooler host."
  );
  process.exit(1);
}

let directHostname = "";
try {
  // URL() requires an http(s) protocol for reliable parsing of postgres URLs
  // with special characters; normalize the scheme for parsing only.
  const parseable = directUrl.replace(/^postgresql:/i, "http:").replace(/^postgres:/i, "http:");
  directHostname = new URL(parseable).hostname;
} catch {
  console.error(
    "DIRECT_URL / derived database URL is not a valid connection string."
  );
  process.exit(1);
}

if (directHostname.includes("-pooler")) {
  console.error(
    "Refusing to run Prisma against a Neon pooler hostname."
  );
  console.error(
    "Set DIRECT_URL to the Neon non-pooler connection string (hostname must not contain \"-pooler\")."
  );
  console.error(`Rejected host: ${directHostname}`);
  process.exit(1);
}

console.log(`Running Prisma CLI against direct database host: ${directHostname}`);

const env = {
  ...mergedEnv,
  // Force the Prisma CLI subprocess onto the direct endpoint.
  DATABASE_URL: directUrl,
  DIRECT_URL: directUrl,
};

/** Migrations whose SQL is written to be re-runnable after a failed apply. */
const IDEMPOTENT_MIGRATIONS = new Set([
  "20260825120000_reminder_alerts_and_preferences",
]);

function runPrisma(prismaArgs, { capture } = { capture: false }) {
  return spawnSync("npx", ["prisma", ...prismaArgs], {
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
    encoding: capture ? "utf8" : undefined,
    env,
  });
}

function printCaptured(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

function failedMigrationName(output) {
  const match = String(output).match(/The `([^`]+)` migration started at .* failed/);
  return match?.[1] ?? null;
}

const isMigrateDeploy = args[0] === "migrate" && args[1] === "deploy";
if (!isMigrateDeploy) {
  const result = runPrisma(args);
  process.exit(result.status ?? 1);
}

const first = runPrisma(args, { capture: true });
printCaptured(first);
if ((first.status ?? 1) === 0) {
  process.exit(0);
}

const output = `${first.stdout ?? ""}${first.stderr ?? ""}`;
const failedName = failedMigrationName(output);
const canRetry =
  /P3009/.test(output) && failedName && IDEMPOTENT_MIGRATIONS.has(failedName);

if (!canRetry) {
  process.exit(first.status ?? 1);
}

console.warn(
  `Prisma recorded a failed apply of ${failedName}. Marking it rolled back and retrying because that migration is idempotent.`
);
const resolved = runPrisma(["migrate", "resolve", "--rolled-back", failedName]);
if ((resolved.status ?? 1) !== 0) {
  process.exit(resolved.status ?? 1);
}

const retry = runPrisma(args);
process.exit(retry.status ?? 1);
