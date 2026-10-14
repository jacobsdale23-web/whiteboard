const CURRENT_RE = /^(\d{2})(\d{3})$/;
const LEGACY_RE = /^(\d{2})-(\d{3})$/;

// "26106" style: two-digit year + three-digit sequence, matching the numbers
// carried over from the old app. Legacy "26-001" numbers still count toward
// the sequence so a number is never reused.
export function computeNextProjectNumber(existingNumbers: (string | null)[], year: number): string {
  const yy = String(year % 100).padStart(2, "0");
  let max = 0;
  for (const n of existingNumbers) {
    const m = n?.trim().match(CURRENT_RE) || n?.trim().match(LEGACY_RE);
    if (m && m[1] === yy) max = Math.max(max, parseInt(m[2], 10));
  }
  return `${yy}${String(max + 1).padStart(3, "0")}`;
}
