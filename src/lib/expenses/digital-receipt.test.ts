import assert from "node:assert/strict";
import { describe, it } from "node:test";
import JSZip from "jszip";
import { resolveDigitalReceiptFields } from "./digital-receipt-pdf";
import { assembleReceiptArchive, type ReceiptArchiveEntry } from "./receipt-archive";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const OCR = `
HOME DEPOT OCR
09/01/2026
Widget                 4.00
Tax                    $1.00
Total                  $99.00
`;

function entry(overrides: Partial<ReceiptArchiveEntry> = {}): ReceiptArchiveEntry {
  return {
    filename: "2026-09-15_Home-Depot_8.64.png",
    buffer: PNG,
    mimeType: "image/png",
    date: "2026-09-15",
    vendor: "Home Depot",
    amount: "8.64",
    category: "Supplies",
    employee: "Ada",
    project: "",
    source: {
      merchant: "Home Depot",
      date: "2026-09-15",
      total: 8.64,
      tax: 0.64,
      lineItems: [{ description: "Pine Board", quantity: 2, amount: 8 }],
      ocrText: OCR,
    },
    ...overrides,
  };
}

async function namesOf(archive: Buffer) {
  const zip = await JSZip.loadAsync(archive);
  return { zip, names: Object.keys(zip.files) };
}

function pdfText(buffer: Buffer) {
  const raw = buffer.toString("latin1");
  return [...raw.matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((match) => Buffer.from(match[1]!, "hex").toString("latin1"))
    .join("");
}

describe("digital receipt fields", () => {
  it("keeps stored expense fields when OCR text is also present", () => {
    const fields = resolveDigitalReceiptFields({
      merchant: "Stored Shop",
      date: "2026-09-15",
      total: 10,
      tax: 1,
      lineItems: [{ description: "Nails", amount: 9 }],
      ocrText: OCR,
    });
    assert.equal(fields.merchant, "Stored Shop");
    assert.equal(fields.date, "2026-09-15");
    assert.equal(fields.total, 10);
    assert.equal(fields.tax, 1);
    assert.equal(fields.lineItems[0]?.description, "Nails");
  });

  it("fills gaps from the existing OCR parser when expense lines are absent", () => {
    const fields = resolveDigitalReceiptFields({
      ocrText: `
HOME DEPOT
09/15/2026
Pine Board             8.00
Tax                    $0.64
Total                  $8.64
`,
    });
    assert.equal(fields.merchant, "HOME DEPOT");
    assert.equal(fields.date, "2026-09-15");
    assert.equal(fields.total, 8.64);
    assert.equal(fields.tax, 0.64);
    assert.match(fields.lineItems[0]?.description ?? "", /Pine Board/);
  });

  it("refuses a digital copy when nothing was stored", () => {
    assert.throws(() => resolveDigitalReceiptFields({}), /No stored OCR or expense fields/);
  });
});

describe("receipt archive digital copies", () => {
  it("leaves the archive unchanged when the experimental option is off", async () => {
    const { archive } = await assembleReceiptArchive([entry()], { buildDigitalCopies: false });
    const { zip, names } = await namesOf(archive);
    assert.deepEqual(names.sort(), ["2026-09-15_Home-Depot_8.64.png", "receipt-index.csv"]);
    const csv = await zip.file("receipt-index.csv")!.async("string");
    assert.match(csv, /^filename,date,vendor,amount,category,employee,project/);
    assert.doesNotMatch(csv, /digital/);
  });

  it("adds a digital PDF when stored fields and OCR are available", async () => {
    const { archive } = await assembleReceiptArchive([entry()], { buildDigitalCopies: true });
    const { zip, names } = await namesOf(archive);
    const digitalName = "digital/2026-09-15_Home-Depot_8.64_digital.pdf";
    assert.ok(names.includes("2026-09-15_Home-Depot_8.64.png"));
    assert.ok(names.includes("receipt-index.csv"));
    assert.ok(names.includes(digitalName));
    assert.equal(names.includes("digital-errors.txt"), false);
    const pdf = await zip.file(digitalName)!.async("nodebuffer");
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const text = pdfText(pdf);
    assert.match(text, /Experimental digital copy/);
    assert.match(text, /Merchant: Home Depot/);
    assert.match(text, /Date: 2026-09-15/);
    assert.match(text, /Total: \$8\.64/);
    assert.match(text, /Tax: \$0\.64/);
    assert.match(text, /2 x Pine Board/);
    assert.match(pdf.toString("latin1"), /\/Subtype \/Image/);
    const csv = await zip.file("receipt-index.csv")!.async("string");
    assert.match(csv, /digital/);
    assert.match(csv, new RegExp(digitalName.replace(/[.*]/g, "\\$&")));
  });

  it("skips a bad receipt and still returns the rest of the archive", async () => {
    const bad = entry({
      filename: "2026-09-16_Broken_1.00.png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]),
      mimeType: "image/png",
      vendor: "Broken",
      source: { merchant: "Broken", date: "2026-09-16", total: 1, tax: 0, lineItems: [] },
    });
    const { archive } = await assembleReceiptArchive([entry(), bad], { buildDigitalCopies: true });
    const { zip, names } = await namesOf(archive);
    assert.ok(names.includes("2026-09-15_Home-Depot_8.64.png"));
    assert.ok(names.includes("2026-09-16_Broken_1.00.png"));
    assert.ok(names.includes("digital/2026-09-15_Home-Depot_8.64_digital.pdf"));
    assert.equal(names.some((name) => name.includes("Broken") && name.endsWith("_digital.pdf")), false);
    const errors = await zip.file("digital-errors.txt")!.async("string");
    assert.match(errors, /2026-09-16_Broken_1\.00\.png/);
    assert.match(errors, /could not be read/);
    const csv = await zip.file("receipt-index.csv")!.async("string");
    assert.match(csv, /skipped: Receipt image could not be read/);
    assert.match(csv, /digital\/2026-09-15_Home-Depot_8\.64_digital\.pdf/);
  });

  it("rejects the archive when digital copies push it over the size cap", async () => {
    await assert.rejects(
      () => assembleReceiptArchive([entry()], { buildDigitalCopies: true, maxBytes: 80 }),
      /larger than 80 bytes/
    );
  });

  it("rejects more than 80 receipts", async () => {
    const files = Array.from({ length: 81 }, (_, index) =>
      entry({ filename: `receipt-${index}.png`, buffer: Buffer.from("x") })
    );
    await assert.rejects(
      () => assembleReceiptArchive(files, { buildDigitalCopies: false }),
      /80 receipts or fewer/
    );
  });
});
