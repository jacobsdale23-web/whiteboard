// Finding the QuickBooks customer a name probably means. Pure: no database or network.
// Used before creating a customer, so "City of Westlake" never becomes a second customer next to "Westlake, City of".

const FILLER = new Set(["inc", "llc", "llp", "co", "corp", "corporation", "company", "the", "of", "and", "ltd", "lp"]);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !FILLER.has(w));

// Same words in any order, ignoring case, punctuation and company suffixes.
export const customerKey = (s: string) => words(s).sort().join(" ");

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
}

export type CustomerMatch = { exact: string[]; near: string[] };

// exact: names that are the same apart from case, punctuation, word order and suffixes (use these, don't create).
// near: names that share most of their words or contain each other (ask which one is meant).
export function matchCustomers(wanted: string, existing: string[]): CustomerMatch {
  const wk = customerKey(wanted);
  const ww = words(wanted);
  const exact: string[] = [];
  const scored: { name: string; score: number }[] = [];
  for (const name of existing) {
    const k = customerKey(name);
    if (!k) continue;
    if (k === wk) {
      exact.push(name);
      continue;
    }
    const nw = words(name);
    let score = jaccard(ww, nw);
    const [small, big] = ww.length <= nw.length ? [ww, nw] : [nw, ww];
    if (small.length >= 1 && small.every((w) => big.includes(w)) && small.join("").length >= 4) score = Math.max(score, 0.6); // one name contains the other
    if (score >= 0.5) scored.push({ name, score });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { exact, near: scored.slice(0, 6).map((s) => s.name) };
}

// A name QuickBooks will accept as a customer: no colons (they mean sub-customers), tidy spacing, at most 100 characters.
export const qbCustomerName = (s: string) => s.replace(/[:\t\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
