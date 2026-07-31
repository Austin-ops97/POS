export type SheetGrid = string[][];

function columnIndex(name: string) {
  return name.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

export function columnName(index: number) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

export function cellValue(grid: SheetGrid, reference: string, visited = new Set<string>()): number {
  const normalized = reference.toUpperCase();
  if (visited.has(normalized)) return Number.NaN;
  const match = reference.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return 0;
  const raw = grid[Number(match[2]) - 1]?.[columnIndex(match[1])] ?? "";
  const nextVisited = new Set(visited).add(normalized);
  const resolved = raw.startsWith("=") ? evaluateFormula(raw, grid, nextVisited) : Number(raw.replace(/[$,%]/g, ""));
  return Number.isFinite(resolved) ? resolved : 0;
}

export function evaluateFormula(formula: string, grid: SheetGrid, visited = new Set<string>()): number {
  const expression = formula.trim().replace(/^=/, "").toUpperCase();
  const fn = expression.match(/^(SUM|AVERAGE|MIN|MAX)\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (fn) {
    const start = fn[2].match(/^([A-Z]+)(\d+)$/)!;
    const end = fn[3].match(/^([A-Z]+)(\d+)$/)!;
    const values: number[] = [];
    for (let row = Number(start[2]); row <= Number(end[2]); row++) {
      for (let col = columnIndex(start[1]); col <= columnIndex(end[1]); col++) {
        values.push(cellValue(grid, `${columnName(col)}${row}`, visited));
      }
    }
    if (!values.length) return 0;
    if (fn[1] === "SUM") return values.reduce((a, b) => a + b, 0);
    if (fn[1] === "AVERAGE") return values.reduce((a, b) => a + b, 0) / values.length;
    if (fn[1] === "MIN") return Math.min(...values);
    return Math.max(...values);
  }
  const safe = expression.replace(/[A-Z]+\d+/g, (ref) => String(cellValue(grid, ref, visited)));
  if (!/^[\d\s.+\-*/()%]+$/.test(safe)) return Number.NaN;
  try {
    // The expression is restricted to numbers and arithmetic operators above.
    return Function(`"use strict"; return (${safe})`)() as number;
  } catch { return Number.NaN; }
}

export function parseCsv(text: string): SheetGrid {
  const rows: string[][] = [[]];
  let value = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { rows.at(-1)!.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      rows.at(-1)!.push(value); value = ""; rows.push([]);
    } else value += char;
  }
  rows.at(-1)!.push(value);
  return rows.filter((row, index) => index < rows.length - 1 || row.some(Boolean));
}

export function toCsv(grid: SheetGrid) {
  return grid.map((row) => row.map((value) => /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join(",")).join("\n");
}
