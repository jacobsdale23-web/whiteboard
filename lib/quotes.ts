// The quote a small job is billed from: validating what's saved, and the checklist the office sees before billing.
// Pure, so it can be checked without a database.

export type QuoteLine = { description: string; qty: number; amount: number };

const MAX_AMOUNT = 100_000_000;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const round2 = (n: number) => Math.round(n * 100) / 100;

export function linesTotal(lines: QuoteLine[]): number {
  return round2(lines.reduce((sum, l) => sum + l.amount, 0));
}

// Tidies what the form sent: drops empty lines, rejects bad numbers.
export function cleanQuoteLines(raw: { description?: unknown; qty?: unknown; amount?: unknown }[]): { lines: QuoteLine[] } | { error: string } {
  const lines: QuoteLine[] = [];
  for (const r of raw || []) {
    const description = String(r.description ?? "").trim();
    const qtyText = String(r.qty ?? "").trim();
    const amountText = String(r.amount ?? "").trim();
    if (!description && !qtyText && !amountText) continue;
    if (!description) return { error: "Every scope line needs a description." };
    const qty = qtyText === "" ? 1 : Number(qtyText);
    const amount = amountText === "" ? 0 : Number(amountText);
    if (!Number.isFinite(qty) || qty < 0 || !Number.isFinite(amount) || Math.abs(amount) > MAX_AMOUNT) return { error: `Check the quantity and amount on "${description.slice(0, 40)}".` };
    lines.push({ description, qty, amount: round2(amount) });
  }
  return { lines };
}

// A link back to the estimate in QuickBooks. Only QuickBooks addresses are kept.
export function cleanQbLink(raw: string): { link: string | null } | { error: string } {
  const text = raw.trim();
  if (!text) return { link: null };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: "That QuickBooks link isn't a web address." };
  }
  if (url.protocol !== "https:" || !(url.hostname === "intuit.com" || url.hostname.endsWith(".intuit.com"))) return { error: "The QuickBooks link must be a qbo.intuit.com address." };
  return { link: url.toString() };
}

export function cleanQuoteFields(f: { number: string; quoteDate: string; total: string | number; expires: string }):
  | { number: string; quoteDate: string | null; total: number; expires: string | null }
  | { error: string } {
  const number = f.number.trim();
  if (!number) return { error: "The quote number is required." };
  const total = Number(String(f.total).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(total) || total <= 0 || total > MAX_AMOUNT) return { error: "Enter the quote total as a positive amount." };
  const quoteDate = f.quoteDate.trim();
  const expires = f.expires.trim();
  if (quoteDate && !isDate(quoteDate)) return { error: "The quote date isn't a valid date." };
  if (expires && !isDate(expires)) return { error: "The expiration date isn't a valid date." };
  return { number, quoteDate: quoteDate || null, total: round2(total), expires: expires || null };
}

export type CheckLog = { date: string; scopeChange: boolean };
export type Check = { key: string; ok: boolean; label: string; detail: string };

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
};

// What the office wants settled before billing a quoted job: the crew logged work, nobody said it differed from the
// quote, and the job is finished. Everything is advisory; the person billing decides.
export function billingChecks(logs: CheckLog[], jobStatus: string): { checks: Check[]; ready: boolean } {
  const dates = logs.map((l) => l.date).sort();
  const flagged = logs.filter((l) => l.scopeChange).map((l) => l.date).sort();
  const days = new Set(dates).size;

  const checks: Check[] = [];
  checks.push(
    logs.length
      ? {
          key: "logs",
          ok: true,
          label: "Daily logs on file",
          detail: `${logs.length} log${logs.length === 1 ? "" : "s"} on ${days} day${days === 1 ? "" : "s"}, ${shortDate(dates[0])}${dates[0] !== dates[dates.length - 1] ? ` to ${shortDate(dates[dates.length - 1])}` : ""}`,
        }
      : { key: "logs", ok: false, label: "Daily logs on file", detail: "No daily logs yet, so nothing shows the work was done." }
  );
  checks.push(
    !logs.length
      ? { key: "scope", ok: false, label: "Work matched the quote", detail: "Can't confirm without daily logs." }
      : flagged.length
        ? {
            key: "scope",
            ok: false,
            label: "Work matched the quote",
            detail: `${flagged.length} log${flagged.length === 1 ? "" : "s"} flagged a change from the quote (${flagged.map(shortDate).join(", ")}). Read ${flagged.length === 1 ? "it" : "them"} below; attach a change-order quote if the price moves.`,
          }
        : { key: "scope", ok: true, label: "Work matched the quote", detail: "No log reports a change from the quote." }
  );
  const finished = jobStatus === "complete" || jobStatus === "billed";
  checks.push({
    key: "status",
    ok: finished,
    label: "Job finished",
    detail: finished ? `Job is marked ${jobStatus}.` : `Job is still ${jobStatus.replace("_", " ")}. Mark it complete when the crew is done.`,
  });
  return { checks, ready: checks.every((c) => c.ok) };
}
