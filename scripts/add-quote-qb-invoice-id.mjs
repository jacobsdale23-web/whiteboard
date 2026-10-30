// Additive: remembers the QuickBooks invoice White Board created from a quote. Safe to re-run.
// Run BEFORE deploying the code. Run: node --env-file=.env.local scripts/add-quote-qb-invoice-id.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("alter table project_quotes add column if not exists qb_invoice_id text");
const n = await client.query("select count(*)::int n from project_quotes");
console.log("project_quotes.qb_invoice_id ready; quotes:", n.rows[0].n);
await client.end();
