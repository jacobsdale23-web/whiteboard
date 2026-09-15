const PROJECT_NUMBER_RE = /^(\d{2})-(\d{3})$/;

// "26-001" style: two-digit start year, sequential within that year. Only
// ever called for lump-sum/unit-price jobs — T&M jobs use the client's own
// task/PO number instead.
export function computeNextProjectNumber(existingNumbers: (string | null)[], year: number): string {
  const yy = String(year % 100).padStart(2, "0");
  let max = 0;
  for (const n of existingNumbers) {
    const m = n?.match(PROJECT_NUMBER_RE);
    if (m && m[1] === yy) max = Math.max(max, parseInt(m[2], 10));
  }
  return `${yy}-${String(max + 1).padStart(3, "0")}`;
}
