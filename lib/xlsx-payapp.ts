import * as XLSX from "xlsx";

export type ParsedSovRow = {
  itemNo: string;
  description: string;
  bidQty: number;
  unitPrice: number;
  baselineQty: number;
  periodQty: number;
  stored: number;
};

export type ParsedPayApp = {
  appNumber: string | null;
  period: string | null;
  applicationDate: string | null;
  retainagePercent: number | null;
  rows: ParsedSovRow[];
  sheetName: string | null;
};

function xlNum(sheet: XLSX.WorkSheet, r: number, c: number): number {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return 0;
  if (typeof cell.v === "number") return cell.v;
  const n = parseFloat(cell.v);
  return isNaN(n) ? 0 : n;
}

// Built for the EJCDC-style "Cover Page" + "Progress Estimate - Period"
// pay app template. If a future template shifts the layout, fields simply
// come back null/empty and the caller's form stays fully editable.
export function parsePayAppWorkbook(buf: ArrayBuffer): ParsedPayApp {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const coverName =
    wb.SheetNames.find((n) => /cover/i.test(n)) || wb.SheetNames.find((n) => /pay application/i.test(n));
  const progName =
    wb.SheetNames.find((n) => /progress estimate/i.test(n) && /period/i.test(n) && !/itd/i.test(n)) ||
    wb.SheetNames.find((n) => /progress estimate/i.test(n) && !/itd/i.test(n));

  const cover = coverName ? wb.Sheets[coverName] : null;
  const prog = progName ? wb.Sheets[progName] : null;

  let appNumber: string | null = null;
  let period: string | null = null;
  let applicationDate: string | null = null;
  let retainagePercent: number | null = null;

  if (cover) {
    const appNumCell = cover["G3"];
    if (appNumCell?.v !== undefined) appNumber = String(appNumCell.v);
    const periodCell = cover["G2"];
    if (periodCell?.v !== undefined) period = String(periodCell.v);
    const dateCell = cover["L2"];
    if (dateCell?.v instanceof Date) applicationDate = dateCell.v.toISOString().slice(0, 10);
    const retainCell = cover["H19"];
    if (retainCell?.v !== undefined && !isNaN(Number(retainCell.v))) retainagePercent = Number(retainCell.v) * 100;
  }

  const rows: ParsedSovRow[] = [];
  if (prog?.["!ref"]) {
    const range = XLSX.utils.decode_range(prog["!ref"]);
    let headerRow: number | null = null;
    for (let r = range.s.r; r <= range.e.r; r++) {
      const cell = prog[XLSX.utils.encode_cell({ r, c: 0 })];
      if (cell && String(cell.v).trim() === "Item") {
        headerRow = r;
        break;
      }
    }
    const dataStart = headerRow !== null ? headerRow + 3 : 11;
    for (let r = dataStart; r <= range.e.r; r++) {
      const a = prog[XLSX.utils.encode_cell({ r, c: 0 })];
      const b = prog[XLSX.utils.encode_cell({ r, c: 1 })];
      if (!a || a.v === undefined || a.v === "") break;
      rows.push({
        itemNo: String(a.v),
        description: b ? String(b.v) : "",
        bidQty: xlNum(prog, r, 5),
        unitPrice: xlNum(prog, r, 6),
        baselineQty: xlNum(prog, r, 8),
        periodQty: xlNum(prog, r, 9),
        stored: xlNum(prog, r, 12),
      });
    }
  }

  return { appNumber, period, applicationDate, retainagePercent, rows, sheetName: progName || null };
}
