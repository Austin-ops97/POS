import { put, del } from "@vercel/blob";
import { randomUUID } from "crypto";

function requireBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "Blob storage is not configured. Set BLOB_READ_WRITE_TOKEN for project completion photos."
    );
  }
  return token;
}

export function projectBlobPrefix(businessId: string, projectId: string) {
  return `business/${businessId}/projects/${projectId}`;
}

export function buildProjectBlobKey(input: {
  businessId: string;
  projectId: string;
  filename: string;
}) {
  const safeName = input.filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
  return `${projectBlobPrefix(input.businessId, input.projectId)}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
}

export async function uploadBlob(input: {
  businessId: string;
  projectId: string;
  filename: string;
  body: Buffer | Blob | ArrayBuffer | ReadableStream | File;
  contentType: string;
  access?: "public" | "private";
}) {
  const token = requireBlobToken();
  const pathname = buildProjectBlobKey({
    businessId: input.businessId,
    projectId: input.projectId,
    filename: input.filename,
  });

  // Tenant-scoped key prefix: business/{businessId}/projects/{projectId}/...
  if (!pathname.startsWith(projectBlobPrefix(input.businessId, input.projectId))) {
    throw new Error("Invalid blob key for tenant");
  }

  const result = await put(pathname, input.body, {
    access: input.access ?? "public",
    contentType: input.contentType,
    token,
    addRandomSuffix: false,
  });

  return {
    storageKey: result.pathname,
    storageUrl: result.url,
    contentType: result.contentType,
  };
}

export async function deleteBlob(storageUrlOrKey: string) {
  const token = requireBlobToken();
  await del(storageUrlOrKey, { token });
}
