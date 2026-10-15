/** Shown to admins when project completion photos cannot be stored. */
export const PROJECT_BLOB_SETUP_MESSAGE =
  "Blob storage is not configured. An administrator needs to create a Vercel Blob store, set BLOB_READ_WRITE_TOKEN on Production and Preview, and redeploy. Tasks and project details still work.";

export function isProjectBlobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function isProjectBlobConfigError(message: string) {
  return message.includes("Blob storage is not configured");
}
