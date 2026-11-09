import * as XLSX from "xlsx";

export type ParsedSovRow = {
  itemNo: string;
  description: string;
  unit?: string;
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
  // Which layout was recognized: the EJCDC cover + progress estimate, or Atmos's "Continuation Sheet".
  format: "ejcdc" | "atmos" | null;
  // Something worth a second look (shown under the file picker).
  warning?: string;
};

function xlNum(sheet: XLSX.WorkSheet, r: number, c: number): number {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (!cell) return 0;
  if (typeof cell.v === "number") return cell.v;
  const n = parseFloat(cell.v);
  return isNaN(n) ? 0 : n;
}

// Built for the EJCDC-style "Cover Page" + "Progress Estimate - Period" pay app template, and for Atmos Energy's
// one-sheet "Continuation Sheet". If a template shifts its layout, fields simply come back null/empty and the
// caller's form stays fully editable.
export function parsePayAppWorkbook(buf: ArrayBuffer): ParsedPayApp {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ejcdc = parseEjcdc(wb);
  if (ejcdc.rows.length) return ejcdc;
  for (const name of wb.SheetNames) {
    const atmos = parseAtmosSheet(wb.Sheets[name], name);
    if (atmos) return atmos;
  }
  return ejcdc;
}

function parseEjcdc(wb: XLSX.WorkBook): ParsedPayApp {
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

  return { appNumber, period, applicationDate, retainagePercent, rows, sheetName: progName || null, format: rows.length ? "ejcdc" : null };
}

// ---------- Atmos Energy "Continuation Sheet" ----------
// One sheet: header block (Application No, Period From / To, Invoice Date, Payment Amount) over a table whose columns are
// Item No. | Comments | Description of Work | Amount (bid qty) | Unit Cost | UOM | Total Cost | Work Completed: Amount
// (this period's quantity), From Previous Applications ($), This Period in Place ($) | Total Completed | Percent | Balance.
// Columns are found by their headings, so a shifted column doesn't break it. Atmos holds no retainage.

const text = (cell: XLSX.CellObject | undefined) => (cell && cell.v !== undefined && cell.v !== null ? String(cell.v).replace(/\s+/g, " ").trim() : "");

function toIso(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  return null;
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${String(y).slice(2)}`;
}

function parseAtmosSheet(sheet: XLSX.WorkSheet | undefined, sheetName: string): ParsedPayApp | null {
  if (!sheet?.["!ref"]) return null;
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const at = (r: number, c: number) => sheet[XLSX.utils.encode_cell({ r, c })];

  // Find the heading row: the one holding "Unit Cost".
  let hdr = -1;
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 40) && hdr < 0; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) if (/^unit cost$/i.test(text(at(r, c)))) hdr = r;
  }
  if (hdr < 0) return null;

  // Headings can sit on up to three stacked rows (some cells are merged), so gather every column's labels.
  const labels = new Map<number, string[]>();
  for (let r = Math.max(range.s.r, hdr - 1); r <= hdr + 2; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const t = text(at(r, c)).toLowerCase();
      if (t) labels.set(c, [...(labels.get(c) ?? []), t]);
    }
  }
  const colWhere = (re: RegExp, pick: (cols: number[]) => number | undefined = (cols) => cols[0]) =>
    pick([...labels.entries()].filter(([, ts]) => ts.some((t) => re.test(t))).map(([c]) => c).sort((a, b) => a - b));
  const itemCol = colWhere(/^item no/);
  const commentsCol = colWhere(/^comments$/);
  const descCol = colWhere(/^description of work$/);
  const unitCostCol = colWhere(/^unit cost$/);
  const uomCol = colWhere(/^uom$/);
  const totalCostCol = colWhere(/^total cost$/);
  const prevCol = colWhere(/from previous/);
  if (itemCol === undefined || unitCostCol === undefined || prevCol === undefined) return null;
  // "Amount" appears twice: before Unit Cost it is the bid quantity, after Total Cost it is this period's quantity.
  const bidQtyCol = colWhere(/^amount$/, (cols) => cols.filter((c) => c < unitCostCol).pop());
  const periodQtyCol = colWhere(/^amount$/, (cols) => cols.find((c) => c > (totalCostCol ?? unitCostCol)));
  if (bidQtyCol === undefined || periodQtyCol === undefined) return null;

  // Header block above the table.
  let appNumber: string | null = null;
  let applicationDate: string | null = null;
  let from: string | null = null;
  let to: string | null = null;
  let paymentAmount: number | null = null;
  const valueRightOf = (r: number, c: number): XLSX.CellObject | undefined => {
    for (let cc = c + 1; cc <= range.e.c; cc++) {
      const cell = at(r, cc);
      if (cell && cell.v !== undefined && cell.v !== "" && !/:\s*$/.test(text(cell))) return cell;
    }
    return undefined;
  };
  for (let r = range.s.r; r < hdr; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const t = text(at(r, c));
      if (/^application no/i.test(t)) appNumber = text(valueRightOf(r, c)) || null;
      else if (/^period from/i.test(t)) from = toIso(valueRightOf(r, c)?.v);
      else if (/^period to/i.test(t)) to = toIso(valueRightOf(r, c)?.v);
      else if (/^invoice date/i.test(t)) applicationDate = toIso(valueRightOf(r, c)?.v);
      else if (/^payment amount/i.test(t)) {
        const v = valueRightOf(r, c)?.v;
        if (typeof v === "number") paymentAmount = v;
      }
    }
  }

  const rows: ParsedSovRow[] = [];
  let started = false;
  for (let r = hdr + 1; r <= range.e.r; r++) {
    const item = text(at(r, itemCol));
    if (/change order|grand total/i.test(item) || (started && /change order|grand total/i.test(text(at(r, descCol ?? itemCol))))) break;
    // Skip the heading rows that sit under "Unit Cost" and anything that isn't an item number.
    if (!item || /^item|^c\.?o\.? no|^amount$/i.test(item)) continue;
    started = true;
    const comments = commentsCol !== undefined ? text(at(r, commentsCol)) : "";
    const work = descCol !== undefined ? text(at(r, descCol)) : "";
    const description = (comments && comments !== "0" ? comments : work && work !== "0" ? work : "").trim();
    const bidQty = xlNum(sheet, r, bidQtyCol);
    const unitPrice = xlNum(sheet, r, unitCostCol);
    const prevDollars = xlNum(sheet, r, prevCol);
    const periodQty = xlNum(sheet, r, periodQtyCol);
    // Unused placeholder lines (no name, nothing bid, nothing billed) are left out.
    if (!description && !bidQty && !prevDollars && !periodQty) continue;
    const uom = uomCol !== undefined ? text(at(r, uomCol)) : "";
    rows.push({
      itemNo: item,
      description,
      unit: uom && uom !== "0" ? uom : "",
      bidQty,
      unitPrice,
      // Atmos shows what was billed before as dollars; the quantity behind it is dollars / unit cost.
      baselineQty: unitPrice ? Math.round((prevDollars / unitPrice) * 10000) / 10000 : 0,
      periodQty,
      stored: 0,
    });
  }
  if (!rows.length) return null;

  const periodDollars = rows.reduce((s, r) => s + r.periodQty * r.unitPrice, 0);
  const warning =
    paymentAmount !== null && Math.abs(periodDollars - paymentAmount) > 1
      ? `The line items add up to $${periodDollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} this period, but the sheet's Payment Amount is $${paymentAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Check before saving.`
      : undefined;

  return {
    appNumber,
    period: from && to ? `${shortDate(from)} - ${shortDate(to)}` : null,
    applicationDate,
    retainagePercent: 0,
    rows,
    sheetName,
    format: "atmos",
    warning,
  };
}
