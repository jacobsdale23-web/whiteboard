// Pure logic for matching foremen's scanned receipts to credit card charges booked in QuickBooks.
// (No database or QuickBooks calls here.)

export type Charge = { id: string; date: string; amount: number; vendor: string; memo: string; coded: boolean; credit: boolean };
export type ReceiptLite = { id: string; date: string | null; amount: number; vendor: string | null; projectId: string; projectName: string; submittedBy: string; qbTxnId: string | null };

// auto = safe to match and code without a person: exact amount, the vendor agrees, and nothing else on either side could
// be the same pair (no other receipt could be this charge, no other charge could be this receipt).
export type Suggestion = { receipt: ReceiptLite; charge: Charge; confidence: "high" | "possible"; note: string; days: number; auto: boolean };
export type MatchResult = { suggestions: Suggestion[]; chargesWithoutReceipt: Charge[]; receiptsWithoutCharge: ReceiptLite[]; alreadyMatched: number };

const STOP = new Set(["inc", "llc", "co", "corp", "company", "the", "store", "of", "and", "no", "pos", "purchase", "debit", "card"]);
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d+$/.test(t));

// Share of the receipt vendor's words that appear in the charge's vendor/memo text (0 to 1).
export function vendorSimilarity(receiptVendor: string | null, chargeText: string): number {
  const a = tokens(receiptVendor || "");
  if (!a.length) return 0;
  const hay = new Set(tokens(chargeText));
  const joined = chargeText.toLowerCase().replace(/[^a-z0-9]+/g, "");
  let hit = 0;
  for (const t of a) if (hay.has(t) || joined.includes(t)) hit++;
  return hit / a.length;
}

const dayNum = (iso: string) => Math.round(Date.parse(iso + "T00:00:00Z") / 86400000);
const cents = (n: number) => Math.round(n * 100);

// A card charge usually posts a day or few after the purchase; the QuickBooks date can also be the posting date.
const EARLY = -3; // charge up to 3 days before the receipt date
const LATE = 10; // charge up to 10 days after

export function matchReceipts(receipts: ReceiptLite[], charges: Charge[]): MatchResult {
  const open = receipts.filter((r) => !r.qbTxnId);
  const usedCharges = new Set(receipts.filter((r) => r.qbTxnId).map((r) => r.qbTxnId as string));
  const freeCharges = charges.filter((c) => !c.credit && !usedCharges.has(c.id));

  type Cand = Suggestion & { score: number; exact: boolean; sim: number };
  const cands: Cand[] = [];
  for (const r of open) {
    if (!r.date) continue;
    for (const c of freeCharges) {
      const days = dayNum(c.date) - dayNum(r.date);
      if (days < EARLY || days > LATE) continue;
      const sim = vendorSimilarity(r.vendor, `${c.vendor} ${c.memo}`);
      const exact = cents(c.amount) === cents(r.amount);
      // A restaurant charge often includes a tip the receipt total did not: allow it a little over, only when the vendor agrees.
      const tip = !exact && c.amount > r.amount && c.amount <= r.amount * 1.3 + 0.005 && sim >= 0.5;
      if (!exact && !tip) continue;
      const score = (exact ? 100 : 60) - Math.abs(days) * 3 + sim * 30;
      cands.push({
        receipt: r,
        charge: c,
        days,
        score,
        exact,
        sim,
        auto: false,
        confidence: exact && (sim >= 0.5 || days >= 0) ? "high" : "possible",
        note: exact ? (sim >= 0.5 ? "Same amount, vendor agrees" : "Same amount; vendor name doesn't obviously agree") : `Charge is $${(c.amount - r.amount).toFixed(2)} higher (tip?)`,
      });
    }
  }
  // How many different partners each receipt and each charge could have (any candidate, exact or not).
  const perReceipt = new Map<string, number>();
  const perCharge = new Map<string, number>();
  for (const k of cands) {
    perReceipt.set(k.receipt.id, (perReceipt.get(k.receipt.id) || 0) + 1);
    perCharge.set(k.charge.id, (perCharge.get(k.charge.id) || 0) + 1);
  }
  // One receipt per charge: best scores first.
  cands.sort((a, b) => b.score - a.score);
  const takenR = new Set<string>();
  const takenC = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const k of cands) {
    if (takenR.has(k.receipt.id) || takenC.has(k.charge.id)) continue;
    takenR.add(k.receipt.id);
    takenC.add(k.charge.id);
    const { score: _s, exact, sim, ...s } = k;
    void _s;
    const unambiguous = perReceipt.get(k.receipt.id) === 1 && perCharge.get(k.charge.id) === 1;
    suggestions.push({ ...s, auto: exact && sim >= 0.5 && unambiguous && !k.charge.coded });
  }
  suggestions.sort((a, b) => (a.charge.date < b.charge.date ? 1 : -1));
  return {
    suggestions,
    chargesWithoutReceipt: freeCharges.filter((c) => !takenC.has(c.id)),
    receiptsWithoutCharge: open.filter((r) => !takenR.has(r.id)),
    alreadyMatched: receipts.length - open.length,
  };
}
