import { del, put } from "@vercel/blob";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function parseCardLogoDataUrl(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error("Invalid logo upload: use a PNG, JPEG, or WebP image");
  const mimeType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  if (!ALLOWED.has(mimeType)) throw new Error("Invalid logo upload: use a PNG, JPEG, or WebP image");
  const data = Buffer.from(match[2], "base64");
  if (!data.length) throw new Error("Invalid logo upload: the file is empty");
  if (data.length > MAX_LOGO_BYTES) throw new Error("Invalid logo upload: file exceeds 2 MB");
  return { mimeType, data };
}

export async function persistCardLogo(input: {
  businessId: string;
  cardId: string;
  data: Buffer;
  mimeType: string;
  previousKey?: string | null;
}) {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return {
      logoUrl: null as string | null,
      logoStorageKey: null as string | null,
      logoData: input.data,
      logoMime: input.mimeType,
    };
  }

  const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
  const pathname = `business/${input.businessId}/cards/${input.cardId}/logo-${Date.now()}.${extension}`;
  const prefix = `business/${input.businessId}/cards/${input.cardId}/`;
  if (!pathname.startsWith(prefix)) throw new Error("Invalid blob key for tenant");

  const result = await put(pathname, input.data, {
    access: "public",
    contentType: input.mimeType,
    token,
    addRandomSuffix: false,
  });
  if (input.previousKey) {
    try {
      await del(input.previousKey, { token });
    } catch {
      // Replacing a logo should succeed even if the previous blob is already gone.
    }
  }
  return {
    logoUrl: result.url,
    logoStorageKey: result.pathname,
    logoData: null as Buffer | null,
    logoMime: input.mimeType,
  };
}

export async function deleteCardLogoBlob(storageKey: string | null | undefined) {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token || !storageKey) return;
  try {
    await del(storageKey, { token });
  } catch {
    // The card row is the source of truth if the blob was already removed.
  }
}
