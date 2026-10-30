// Production quantities on daily logs (unit-price jobs): what the foreman installed each day, by line item, and the
// compile step that turns a date range of logs into the "this period" quantities of a pay application.

export type LogQuantity = { itemNo: string; qty: number };

const MAX_QTY = 10_000_000;

// Pairs of (line item, quantity) from the log form. Rows with no item are ignored; an item with a missing,
// non-numeric or non-positive quantity is an error so nothing is silently dropped; the same item twice adds up.
// `allowed` is the project's line items (plus any item already on the log being edited).
export function cleanQuantities(items: unknown[], qtys: unknown[], allowed: Set<string>): { quantities: LogQuantity[] } | { error: string } {
  const sums = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    const itemNo = String(items[i] ?? "").trim();
    if (!itemNo) continue;
    if (!allowed.has(itemNo)) return { error: `Line item ${itemNo} isn't on this job's list.` };
    const raw = String(qtys[i] ?? "").trim();
    const qty = Number(raw);
    if (!raw || !Number.isFinite(qty) || qty <= 0) return { error: `Enter how many of line item ${itemNo} were installed, or remove it.` };
    if (qty > MAX_QTY) return { error: `That quantity for line item ${itemNo} looks too large.` };
    sums.set(itemNo, (sums.get(itemNo) || 0) + qty);
  }
  // Float sums like 0.1 + 0.2 are tidied to a few decimals.
  return { quantities: [...sums].map(([itemNo, qty]) => ({ itemNo, qty: Math.round(qty * 10000) / 10000 })) };
}

export type ProductionLog = { id: string; date: string; quantities: LogQuantity[] | null };
export type ProductionRow = { itemNo: string; qty: number; days: { date: string; qty: number }[] };

// Everything the logs dated from..to (inclusive, YYYY-MM-DD) installed, per line item, with the days it came from.
export function compileProduction(logs: ProductionLog[], from: string, to: string): { rows: ProductionRow[]; logCount: number; dayCount: number } {
  const byItem = new Map<string, Map<string, number>>();
  const days = new Set<string>();
  let logCount = 0;
  for (const log of logs) {
    if (log.date < from || log.date > to) continue;
    const qs = (log.quantities || []).filter((q) => q.qty > 0);
    if (!qs.length) continue;
    logCount++;
    days.add(log.date);
    for (const q of qs) {
      const perDay = byItem.get(q.itemNo) || new Map<string, number>();
      perDay.set(log.date, (perDay.get(log.date) || 0) + q.qty);
      byItem.set(q.itemNo, perDay);
    }
  }
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const rows = [...byItem].map(([itemNo, perDay]) => {
    const daysList = [...perDay].map(([date, qty]) => ({ date, qty: round(qty) })).sort((a, b) => a.date.localeCompare(b.date));
    return { itemNo, qty: round(daysList.reduce((n, d) => n + d.qty, 0)), days: daysList };
  });
  rows.sort((a, b) => a.itemNo.localeCompare(b.itemNo, undefined, { numeric: true }));
  return { rows, logCount, dayCount: days.size };
}

// Pay apps already built from daily logs whose date range overlaps from..to (a date can only be billed once).
export function overlappingApps<T extends { appNumber: string; logFrom: string | null; logTo: string | null }>(apps: T[], from: string, to: string): T[] {
  return apps.filter((a) => a.logFrom && a.logTo && a.logFrom <= to && a.logTo >= from);
}

export const fmtQty = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 4 }));

export const byItemNo = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
