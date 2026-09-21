import JSZip from "jszip";
import { IMPORT_BYTE_LIMIT, tableFromRows, type ParsedTable } from "./import-plan";

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");
}

function sharedStrings(xml: string): string[] {
  const items = xml.match(/<si[\s\S]*?<\/si>/g) ?? [];
  return items.map((item) => {
    const parts = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? ""));
    return parts.join("");
  });
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

export async function parseXlsx(buffer: Buffer): Promise<ParsedTable> {
  if (buffer.byteLength > IMPORT_BYTE_LIMIT) throw new Error("Invalid import: file is larger than 1.5 MB");
  const zip = await JSZip.loadAsync(buffer);
  const sheetFile = zip.file("xl/worksheets/sheet1.xml");
  if (!sheetFile) throw new Error("Invalid import: workbook has no first worksheet");
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const strings = sharedFile ? sharedStrings(await sharedFile.async("string")) : [];
  const sheet = await sheetFile.async("string");
  const rowXml = sheet.match(/<row[^>]*>[\s\S]*?<\/row>/g) ?? [];
  const matrix: string[][] = [];
  for (const row of rowXml) {
    const cells = [...row.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)];
    if (!cells.length) continue;
    const values: string[] = [];
    for (const cell of cells) {
      const attrs = cell[1] ?? "";
      const body = cell[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? "";
      const index = ref ? columnIndex(ref) : values.length;
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "";
      let text = "";
      if (type === "s") {
        const pointer = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
        text = strings[pointer] ?? "";
      } else if (type === "inlineStr") {
        text = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXml(match[1] ?? "")).join("");
      } else {
        text = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      }
      values[index] = decodeXml(text).trim();
    }
    const width = values.length;
    const filled = Array.from({ length: width }, (_, index) => values[index] ?? "");
    if (filled.some(Boolean)) matrix.push(filled);
  }
  return tableFromRows("XLSX", matrix);
}
