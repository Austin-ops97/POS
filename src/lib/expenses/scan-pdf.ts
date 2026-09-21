import PDFDocument from "pdfkit";

export type ScanPdfPage = {
  data: Buffer;
  width?: number;
  height?: number;
};

const MAX_PAGES = 12;

function pageSize(page: ScanPdfPage): { width: number; height: number } {
  const width = page.width && page.width > 0 ? page.width : 612;
  const height = page.height && page.height > 0 ? page.height : 792;
  const scale = Math.min(1, 1600 / Math.max(width, height));
  return {
    width: Math.max(72, Math.round(width * scale)),
    height: Math.max(72, Math.round(height * scale)),
  };
}

/** Builds one PDF from already-cropped page images. Callers persist it with the receipt. */
export async function buildScanPdf(pages: ScanPdfPage[]): Promise<Buffer> {
  if (!pages.length) throw new Error("Invalid scan: add at least one page");
  if (pages.length > MAX_PAGES) throw new Error("Invalid scan: a receipt PDF can include at most 12 pages");

  return new Promise((resolve, reject) => {
    const first = pageSize(pages[0]!);
    const doc = new PDFDocument({ size: [first.width, first.height], margin: 0, autoFirstPage: false });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    for (const page of pages) {
      const size = pageSize(page);
      doc.addPage({ size: [size.width, size.height], margin: 0 });
      doc.image(page.data, 0, 0, { width: size.width, height: size.height });
    }
    doc.end();
  });
}
