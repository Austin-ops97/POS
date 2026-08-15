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

const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
