/**
 * Vercel / production build entrypoint.
 *
 * Preview deploys skip `migrate deploy` so an unmerged schema change cannot
 * block the required Vercel check (or mutate a shared production database).
 * Production builds still apply migrations before `next build`.
 */
import { spawnSync } from "node:child_process";

const isVercelPreview =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "preview";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (isVercelPreview) {
  console.log(
    "Skipping prisma migrate deploy on Vercel preview. Production builds still migrate."
  );
} else {
  run("node", ["scripts/prisma-with-direct.mjs", "migrate", "deploy"]);
}

run("npx", ["next", "build"]);
