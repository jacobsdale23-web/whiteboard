// Free-text match: exact (trimmed, case-insensitive) or one containing the
// other, so "Atmos" still matches "Atmos Energy Corporation". No fuzzier
// than that — the estimator makes the final call on what's actually similar.
export function isSimilarText(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a || "").trim().toLowerCase();
  const y = (b || "").trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}
