// Records the QuickBooks invoice against a White Board quote once a job has been billed, for the twice-weekly QuickBooks
// check. Feliciana only (the Intuit connector reads Feliciana's QuickBooks).
//
// Input: the JSON from the connector's qbo_sales_get_invoices (an object with a `data` array, or the array itself).
// For every quote not yet billed, an invoice is recorded only when it is clearly that quote's invoice:
//   - same amount as the quote, dated on or after the quote, not already recorded on another quote, AND
//   - the invoice's customer is the job's QuickBooks number ("26095 - ..."), or the invoice text names the quote
//     ("as quoted on 10/13/26 quote #1647"), or it is the only such invoice for the quote's customer and the quote is
//     the only unbilled quote of that customer with that amount.
// Everything else that looks possible is listed as a suggestion, never recorded. Nothing in QuickBooks is changed.
//
// Run: node --env-file=.env.local scripts/record-qb-invoices.mjs <invoices.json> [--dry]
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
const dry = process.argv.includes("--dry");
const raw = JSON.parse(readFileSync(file, "utf8"));
const invoices = (Array.isArray(raw) ? raw : raw.data || []).map((i) => ({
  no: String(i.reference_number ?? "").trim(),
  date: i.txn_date || "",
  amount: Number(i.amount) || 0,
  balance: Number(i.balance_amount) || 0,
  customer: i.contact?.display_name || "",
  text: [i.private_memo, ...(i.lines || []).map((l) => l.description)].filter(Boolean).join(" "),
}));
if (!invoices.length) {
  console.log("No invoices in the input; nothing to do.");
  process.exit(0);
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(llc|inc|co|corp|corporation|company|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const jobOf = (c) => c.match(/^\s*(\d{2}[0-9A-Za-z]{3,})\s*-/)?.[1] || null;
const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const quotes = (
  await client.query(
    `select q.id, q.number, q.total, q.quote_date, q.customer, q.billed_invoice_no, p.project_number, p.name, p.status
       from project_quotes q join projects p on p.id = q.project_id where p.company_id = 'fwi'`
  )
).rows.map((q) => ({ ...q, total: Number(q.total) }));

const taken = new Set(quotes.filter((q) => q.billed_invoice_no).map((q) => q.billed_invoice_no));
const open = quotes.filter((q) => !q.billed_invoice_no);
const free = invoices.filter((i) => !taken.has(i.no));
const claimed = new Set();
const recorded = [];
const suggestions = [];

for (const q of open) {
  const cands = free.filter((i) => Math.abs(i.amount - q.total) < 0.01 && (!q.quote_date || i.date >= q.quote_date));
  if (!cands.length) continue;
  const strong = cands.filter((i) => (q.project_number && jobOf(i.customer) === q.project_number) || new RegExp(`quote\\s*#?\\s*${q.number}\\b`, "i").test(i.text));
  let pick = strong.length === 1 ? strong[0] : null;
  let why = pick ? (jobOf(pick.customer) === q.project_number ? `invoice is billed to job ${q.project_number}` : `invoice text names quote #${q.number}`) : "";
  if (!pick && !strong.length) {
    const sameCust = cands.filter((i) => norm(i.customer) === norm(q.customer));
    const rivals = open.filter((o) => o.id !== q.id && Math.abs(o.total - q.total) < 0.01 && norm(o.customer) === norm(q.customer));
    if (sameCust.length === 1 && !rivals.length) {
      pick = sameCust[0];
      why = "only invoice with this amount for the customer, and the only such open quote";
    }
  }
  if (pick && !claimed.has(pick.no)) {
    claimed.add(pick.no);
    recorded.push({ q, i: pick, why });
  } else {
    // Only worth a person's time when the invoice is for the same customer or the same job number.
    const likely = cands.filter((i) => norm(i.customer) === norm(q.customer) || (q.project_number && jobOf(i.customer) === q.project_number));
    if (likely.length) suggestions.push({ q, cands: likely.slice(0, 4) });
  }
}

for (const { q, i, why } of recorded) {
  console.log(`${dry ? "WOULD RECORD" : "RECORDED"}: quote #${q.number} (${q.project_number || "no number"} ${q.name}) billed on invoice #${i.no}, ${i.date}, ${money(i.amount)}${i.balance ? ` (unpaid ${money(i.balance)})` : ""} [${why}]`);
  if (!dry) {
    await client.query("update project_quotes set billed_invoice_no=$2, billed_date=$3, billed_amount=$4, billed_by='Claude (from QuickBooks)' where id=$1 and billed_invoice_no is null", [q.id, i.no, i.date, i.amount]);
  }
}
for (const { q, cands } of suggestions) {
  console.log(`SUGGESTION (not recorded): quote #${q.number} ${money(q.total)} (${q.project_number || "no number"} ${q.name}) may be invoice ${cands.map((c) => `#${c.no} ${c.date} [${c.customer}]`).join("; ")}`);
}
// Work that is finished but has no invoice: the quotes most worth billing.
const recordedIds = new Set(recorded.map((r) => r.q.id));
for (const q of open) {
  if (!recordedIds.has(q.id) && (q.status === "complete" || q.status === "billed")) {
    console.log(`DONE BUT NOT INVOICED: quote #${q.number} ${money(q.total)} (${q.project_number || "no number"} ${q.name}) - job is ${q.status}${q.status === "billed" ? " in White Board but no invoice was found in QuickBooks" : ""}`);
  }
}
if (!recorded.length && !suggestions.length) console.log(`No new invoices to record; ${open.length} quote(s) still unbilled.`);
await client.end();
