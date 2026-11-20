import { createHash } from "crypto";
import { collectPdf, createPdfDocument } from "@/lib/pdf/create-pdf-document";

export type EsignPdfInput = {
  title: string;
  kind: string;
  body: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  signerIp: string | null;
  userAgent: string | null;
  signatureKind: "DRAW" | "TYPE";
  signatureData: string;
  businessName: string;
};

function wrapText(doc: PDFKit.PDFDocument, text: string) {
  const paragraphs = text.split(/\n+/);
  for (const paragraph of paragraphs) {
    doc.font("Helvetica").fontSize(11).fillColor("#0f172a").text(paragraph || " ", { align: "left" });
    doc.moveDown(0.3);
  }
}

async function renderPages(input: EsignPdfInput, auditHash: string | null): Promise<Buffer> {
  const doc = createPdfDocument({ size: "LETTER", margin: 54 });
  const done = collectPdf(doc);
  doc.font("Helvetica-Bold").fontSize(16).text(input.businessName);
  doc.font("Helvetica").fontSize(10).fillColor("#64748b").text(input.kind.replaceAll("_", " "));
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text(input.title);
  doc.moveDown(0.6);
  wrapText(doc, input.body || "(No document body)");
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(12).text("Signature");
  doc.font("Helvetica").fontSize(10).text(`${input.signerName} · ${input.signerEmail}`);
  doc.text(`Signed ${input.signedAt}`);
  if (input.signatureKind === "TYPE") {
    doc.moveDown(0.4);
    doc.font("Times-Italic").fontSize(22).text(input.signatureData);
  } else if (input.signatureData.startsWith("data:image")) {
    const base64 = input.signatureData.split(",")[1] ?? "";
    try {
      const buf = Buffer.from(base64, "base64");
      doc.image(buf, { fit: [280, 90] });
    } catch {
      doc.font("Helvetica").text("(Signature image could not be embedded)");
    }
  }
  if (auditHash) {
    doc.addPage();
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text("Audit trail");
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10);
    const rows = [
      ["Signer name", input.signerName],
      ["Signer email", input.signerEmail],
      ["Signed at", input.signedAt],
      ["Signer IP", input.signerIp || "—"],
      ["User agent", input.userAgent || "—"],
      ["Signature method", input.signatureKind === "DRAW" ? "Drawn" : "Typed"],
      ["Content SHA-256", auditHash],
    ];
    for (const [label, value] of rows) {
      doc.font("Helvetica-Bold").text(label);
      doc.font("Helvetica").text(value);
      doc.moveDown(0.35);
    }
  }
  doc.end();
  return done;
}

export async function renderSignedEsignPdf(input: EsignPdfInput): Promise<{ pdf: Buffer; sha256: string }> {
  const content = await renderPages(input, null);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const pdf = await renderPages(input, sha256);
  return { pdf, sha256 };
}
