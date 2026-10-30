// Copies QuickBooks invoices into White Board's qb_invoices table (Feliciana only: the Intuit connector reads
// Feliciana's QuickBooks). Upserts by invoice number, so balances stay current as invoices are paid.
//
// Input: the JSON from the connector's qbo_sales_get_invoices (an object with a `data` array, or the array itself).
// Run: node --env-file=.env.local scripts/import-qb-invoices.mjs <invoices.json> [--dry]
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
const dry = process.argv.includes("--dry");
const raw = JSON.parse(readFileSync(file, "utf8"));
const rows = (Array.isArray(raw) ? raw : raw.data || [])
  .map((i) => ({
    no: String(i.reference_number ?? "").trim(),
    date: i.txn_date || null,
    amount: Number(i.amount) || 0,
    balance: Number(i.balance_amount) || 0,
    customer: i.contact?.display_name || "",
    memo: [i.private_memo, ...(i.lines || []).map((l) => l.description)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 400) || null,
    link: i.link || null,
  }))
  .filter((r) => r.no);
if (!rows.length) {
  console.log("No invoices in the input; nothing to do.");
  process.exit(0);
}
const jobOf = (c) => c.match(/^\s*(\d{2}[0-9A-Za-z]{3,})\s*-/)?.[1] || null;
const withJob = rows.filter((r) => jobOf(r.customer)).length;
console.log(`${rows.length} invoices read (${withJob} billed to a numbered job), ${rows.map((r) => r.date).filter(Boolean).sort()[0]} to ${rows.map((r) => r.date).filter(Boolean).sort().pop()}, total ${rows.reduce((s, r) => s + r.amount, 0).toLocaleString("en-US", { style: "currency", currency: "USD" })}`);
if (dry) process.exit(0);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("begin");
for (const r of rows) {
  await client.query(
    `insert into qb_invoices (company_id, invoice_no, project_number, customer, txn_date, amount, balance, memo, link, synced_at)
     values ('fwi', $1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (company_id, invoice_no) do update set project_number = excluded.project_number, customer = excluded.customer,
       txn_date = excluded.txn_date, amount = excluded.amount, balance = excluded.balance, memo = excluded.memo, link = excluded.link, synced_at = now()`,
    [r.no, jobOf(r.customer), r.customer, r.date, r.amount, r.balance, r.memo, r.link]
  );
}
await client.query("commit");
const t = await client.query("select count(*)::int n from qb_invoices where company_id = 'fwi'");
console.log("qb_invoices now holds", t.rows[0].n, "Feliciana invoices");
await client.end();
