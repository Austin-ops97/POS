import PDFDocument from "pdfkit";
import JSZip from "jszip";
import { TAX_SUMMARY_DISCLAIMER, type TaxSummaryRow } from "./tax-summary";

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function taxSummaryCsv(rows: TaxSummaryRow[]): string {
  const header = ["Category", "Tax label", "Transactions", "Total", "With receipt", "Missing receipts"];
  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [row.category, row.taxLabel, String(row.count), dollars(row.totalCents), String(row.withReceipt), String(row.missingReceipts)]
        .map(csvCell)
        .join(","),
    ),
    "",
    csvCell(TAX_SUMMARY_DISCLAIMER),
  ];
  return lines.join("\n");
}

export async function taxSummaryPdf(input: { businessName: string; from: string; to: string; rows: TaxSummaryRow[] }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0f172a").text(input.businessName);
    doc.font("Helvetica").fontSize(12).text("Tax summary");
    doc.fontSize(9).fillColor("#334155").text(`${input.from} to ${input.to}`);
    doc.moveDown(0.4);
    doc.text(TAX_SUMMARY_DISCLAIMER);
    doc.moveDown(0.8);
    doc.fillColor("#0f172a").font("Helvetica").fontSize(9);
    for (const row of input.rows) {
      doc.text(
        `${row.category} · ${row.taxLabel} · ${row.count} transactions · ${dollars(row.totalCents)} · missing receipts ${row.missingReceipts}`,
      );
    }
    if (input.rows.length === 0) doc.text("No categorized business expenses in this range.");
    doc.end();
  });
}

function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function tableToXlsx(headers: string[], rows: string[][]): Promise<Buffer> {
  const all = [headers, ...rows];
  const strings: string[] = [];
  const index = new Map<string, number>();
  const sid = (value: string) => {
    const existing = index.get(value);
    if (existing != null) return existing;
    const id = strings.length;
    strings.push(value);
    index.set(value, id);
    return id;
  };
  const sheetRows = all
    .map((row, rowIndex) => {
      const cells = row
        .map((value, column) => `<c r="${columnLetter(column)}${rowIndex + 1}" t="s"><v>${sid(value)}</v></c>`)
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Tax summary" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings
      .map((value) => `<si><t>${xmlEscape(value)}</t></si>`)
      .join("")}</sst>`,
  );
  const generated = await zip.generateAsync({ type: "nodebuffer" });
  return Buffer.from(generated);
}

export async function taxSummaryXlsx(rows: TaxSummaryRow[]): Promise<Buffer> {
  return tableToXlsx(
    ["Category", "Tax label", "Transactions", "Total", "With receipt", "Missing receipts"],
    [
      ...rows.map((row) => [row.category, row.taxLabel, String(row.count), dollars(row.totalCents), String(row.withReceipt), String(row.missingReceipts)]),
      ["", TAX_SUMMARY_DISCLAIMER, "", "", "", ""],
    ],
  );
}

const RECEIPT_FILE_CAP = 40;
const RECEIPT_BYTE_CAP = 30_000_000;

export async function receiptZip(
  files: { name: string; data: Buffer | null }[],
): Promise<{ zip: Buffer; included: number; noted: number }> {
  const zip = new JSZip();
  let included = 0;
  let bytes = 0;
  const notes: string[] = [];
  for (const file of files) {
    if (!file.data || file.data.byteLength === 0) {
      notes.push(`${file.name}: receipt on file without a downloadable copy`);
      continue;
    }
    if (included >= RECEIPT_FILE_CAP || bytes + file.data.byteLength > RECEIPT_BYTE_CAP) {
      notes.push(`${file.name}: omitted because the export reached its size cap`);
      continue;
    }
    zip.file(file.name.replace(/[^\w.\- ]+/g, "_"), file.data);
    included += 1;
    bytes += file.data.byteLength;
  }
  if (notes.length) zip.file("receipt-notes.txt", notes.join("\n"));
  if (included === 0 && notes.length === 0) zip.file("receipt-notes.txt", "No receipts are linked in this range.");
  const generated = await zip.generateAsync({ type: "nodebuffer" });
  return { zip: Buffer.from(generated), included, noted: notes.length };
}
