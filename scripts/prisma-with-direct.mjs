/**
 * Run Prisma CLI with DIRECT_URL set for Neon compatibility.
 *
 * Neon's pooled host (`*-pooler.*`) does not support session advisory locks
 * used by `prisma migrate deploy`, which causes P1002 timeouts on Vercel.
 * Prefer an explicit DIRECT_URL; otherwise strip `-pooler` from DATABASE_URL.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function loadEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/prisma-with-direct.mjs <prisma args...>");
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim() || "";
const explicitDirect = process.env.DIRECT_URL?.trim() || "";
const derivedDirect = databaseUrl
  ? databaseUrl.replace("-pooler.", ".")
  : "";
const directUrl = explicitDirect || derivedDirect || databaseUrl;

if (!databaseUrl && !directUrl) {
  console.error(
    "DATABASE_URL is required. For Neon, also set DIRECT_URL to the non-pooler connection string."
  );
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: databaseUrl || directUrl,
  DIRECT_URL: directUrl,
};

if (!explicitDirect && derivedDirect && derivedDirect !== databaseUrl) {
  console.log(
    "DIRECT_URL not set; using DATABASE_URL with -pooler removed for Prisma migrations/generate."
  );
}

const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  env,
});

process.exit(result.status ?? 1);
