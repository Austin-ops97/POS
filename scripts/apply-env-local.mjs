/**
 * Prefer real values from `.env` / `.env.local` over dummy CI placeholders
 * injected into process.env (pk_test_ci, user:pass@localhost, etc.).
 *
 * Next.js and this Prisma wrapper otherwise let existing process env win,
 * which makes local Clerk keys in `.env.local` look unused.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * @param {string} filename
 * @returns {Record<string, string>}
 */
export function readEnvFile(filename) {
  const path = resolve(process.cwd(), filename);
  /** @type {Record<string, string>} */
  const values = {};
  if (!existsSync(path)) return values;

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
    values[key] = value;
  }
  return values;
}

/**
 * @param {string} key
 * @param {string | undefined} value
 */
export function isPlaceholderEnvValue(key, value) {
  const v = String(value ?? "").trim();
  if (!v) return true;
  if (
    /^(pk_test_ci|sk_test_ci|pk_test_placeholder|sk_test_placeholder|whsec_ci|whsec_placeholder)$/i.test(
      v
    )
  ) {
    return true;
  }
  if (/CLERK/.test(key) && v.length < 24) return true;
  if (
    /^(DATABASE_URL|DIRECT_URL)$/.test(key) &&
    /user:pass@localhost:5432\/db/.test(v)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {NodeJS.ProcessEnv} [baseEnv]
 * @returns {NodeJS.ProcessEnv}
 */
export function envWithLocalOverrides(baseEnv = process.env) {
  const fromFiles = { ...readEnvFile(".env"), ...readEnvFile(".env.local") };
  /** @type {NodeJS.ProcessEnv} */
  const merged = { ...baseEnv };
  for (const [key, value] of Object.entries(fromFiles)) {
    if (isPlaceholderEnvValue(key, merged[key])) {
      merged[key] = value;
    }
  }
  return merged;
}

export function applyLocalEnvOverrides() {
  const merged = envWithLocalOverrides();
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value === "string") process.env[key] = value;
  }
}
