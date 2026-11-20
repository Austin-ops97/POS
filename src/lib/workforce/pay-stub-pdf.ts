import type { PayStubDraft } from "./pay-stub";
import { collectPdf, createPdfDocument } from "@/lib/pdf/create-pdf-document";

export type PayStubPdfInput = {
  employerName: string;
  employerAddress: string | null;
  employerReference: string | null;
  employeeName: string;
  employeeNumber: string | null;
  employeeAddress: string | null;
  payType: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  stub: Pick<
    PayStubDraft,
    | "lines"
    | "gross"
    | "preTaxDeductions"
    | "taxableWages"
    | "employeeTaxes"
    | "postTaxDeductions"
    | "net"
    | "employerTaxes"
    | "ytdGross"
    | "ytdDeductions"
    | "ytdEmployeeTaxes"
    | "ytdNet"
    | "ytdEmployerTaxes"
  >;
};

function money(value: number): string {
  const amount = Number.isFinite(value) ? value : 0;
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function hoursLabel(hours: number | null | undefined, rate: number | null | undefined, kind: string): string {
  if (hours == null || !Number.isFinite(hours)) return "";
  const rateText = kind === "EARNING" && rate != null && Number.isFinite(rate) ? ` @ ${money(rate)}` : "";
  return ` · ${hours.toFixed(2)} h${rateText}`;
}

export async function renderPayStubPdf(input: PayStubPdfInput): Promise<Buffer> {
  const doc = createPdfDocument({ size: "LETTER", margin: 48 });
  const done = collectPdf(doc);

  doc.font("Helvetica-Bold").fontSize(16).text(input.employerName || "Employer");
  doc.font("Helvetica").fontSize(9).fillColor("#334155");
  if (input.employerAddress) doc.text(input.employerAddress);
  if (input.employerReference) doc.text(`Employer reference ${input.employerReference}`);
  doc.moveDown(0.6);
  doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(13).text("Pay stub");
  doc.font("Helvetica").fontSize(10);
  doc.text(`${input.employeeName}${input.employeeNumber ? ` · ${input.employeeNumber}` : ""}`);
  if (input.employeeAddress) doc.text(input.employeeAddress);
  doc.text(`${input.payType} · ${input.periodStart} to ${input.periodEnd} · Pay date ${input.payDate}`);
  doc.moveDown(0.8);

  const sections: Array<{ title: string; kinds: string[] }> = [
    { title: "Earnings", kinds: ["EARNING"] },
    { title: "Deductions", kinds: ["DEDUCTION"] },
    { title: "Employee taxes", kinds: ["TAX"] },
    { title: "Employer payroll taxes", kinds: ["EMPLOYER_TAX"] },
  ];
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  for (const section of sections) {
    const lines = input.stub.lines.filter((line) => section.kinds.includes(line.kind));
    if (!lines.length) continue;
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(section.title);
    doc.moveDown(0.2);
    for (const line of lines) {
      const y = doc.y;
      doc.font("Helvetica").fontSize(9).fillColor("#334155");
      const label = `${line.label}${hoursLabel(line.hours, line.rate, line.kind)}`;
      const amounts = `${money(line.amount)}    YTD ${money(line.ytdAmount)}`;
      doc.text(label, left, y, { width: right - left - 160 });
      doc.text(amounts, right - 160, y, { width: 160, align: "right" });
      doc.y = Math.max(doc.y, y + 12);
      if (line.detail) doc.fontSize(8).fillColor("#64748b").text(line.detail, left);
    }
    doc.moveDown(0.5);
  }

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text("Totals");
  doc.font("Helvetica").fontSize(10);
  const totals = [
    ["Gross", input.stub.gross, input.stub.ytdGross],
    ["Pre-tax deductions", input.stub.preTaxDeductions, null],
    ["Taxable wages", input.stub.taxableWages, null],
    ["Employee taxes", input.stub.employeeTaxes, input.stub.ytdEmployeeTaxes],
    ["Post-tax deductions", input.stub.postTaxDeductions, null],
    ["Net pay", input.stub.net, input.stub.ytdNet],
    ["Employer payroll taxes", input.stub.employerTaxes, input.stub.ytdEmployerTaxes],
  ] as const;
  for (const [label, amount, ytd] of totals) {
    doc.text(`${label}  ${money(amount)}${ytd == null ? "" : `    YTD ${money(ytd)}`}`);
  }
  doc.fontSize(8).fillColor("#64748b").text("Deductions YTD " + money(input.stub.ytdDeductions));
  doc.end();
  return done;
}
