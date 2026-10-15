/** Customer-facing download name. Order numbers stay intact; header-breaking characters do not. */
export function receiptPdfFilename(orderNumber: string): string {
  const cleaned = orderNumber.replace(/[\r\n"/\\:*?<>|]+/g, "").trim().slice(0, 80);
  return `Receipt-${cleaned || "order"}.pdf`;
}

export function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const extended = /filename\*=(?:UTF-8''|utf-8'')([^;]+)/i.exec(header);
  if (extended?.[1]) {
    try {
      const decoded = decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ""));
      if (decoded) return decoded;
    } catch {
      // Fall through to the plain filename parameter.
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header) ?? /filename=([^;\s]+)/i.exec(header);
  const value = plain?.[1]?.trim().replace(/^"|"$/g, "");
  return value || fallback;
}
