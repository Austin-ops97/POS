import PDFDocument from "pdfkit";

/** Standard fonts stay in the pdfkit package; keep it external on Vercel. */
export function createPdfDocument(options: PDFKit.PDFDocumentOptions = {}): PDFKit.PDFDocument {
  return new PDFDocument({
    compress: false,
    autoFirstPage: true,
    ...options,
  });
}

export function collectPdf(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
