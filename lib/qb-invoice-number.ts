// QuickBooks only numbers an invoice itself when it is made on screen; one created through the API arrives with no
// number unless it is given one. These pick the next number the way QuickBooks's own screen would: one more than the
// most recently created invoice that has a plain number.

type NumberedRow = { DocNumber?: string | null };

// Rows are newest first. Returns null when none of them has a plain numeric number (nothing to continue from).
export function nextNumberAfter(rows: NumberedRow[]): string | null {
  for (const r of rows) {
    const n = (r.DocNumber || "").trim();
    if (/^\d{1,9}$/.test(n)) return String(Number(n) + 1);
  }
  return null;
}

// Skips numbers that are already used (an invoice made by hand a moment ago, for example).
export function firstFreeNumber(start: string, taken: Set<string>): string {
  let n = Number(start);
  while (taken.has(String(n))) n += 1;
  return String(n);
}
