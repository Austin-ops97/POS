import PDFDocument from "pdfkit";
import type { PayStubDraft } from "./pay-stub";

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
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export async function renderPayStubPdf(input: PayStubPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).text(input.employerName);
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
    for (const section of sections) {
      const lines = input.stub.lines.filter((line) => section.kinds.includes(line.kind));
      if (!lines.length) continue;
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a").text(section.title);
      doc.moveDown(0.2);
      for (const line of lines) {
        const hours = line.hours != null ? `${line.hours.toFixed(2)} h` : "";
        const rate = line.kind === "EARNING" && line.rate != null ? ` @ ${money(line.rate)}` : "";
        doc.font("Helvetica").fontSize(9).fillColor("#334155");
        doc.text(`${line.label}${hours ? ` · ${hours}${rate}` : ""}`, { continued: true });
        doc.text(`${money(line.amount)}    YTD ${money(line.ytdAmount)}`, { align: "right" });
        if (line.detail) doc.fontSize(8).fillColor("#64748b").text(line.detail);
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
  });
}
