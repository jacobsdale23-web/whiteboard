// Additive: lets a receipt record the QuickBooks card charge it was matched to. Safe to re-run.
// Run BEFORE deploying the code. Run: node --env-file=.env.local scripts/add-receipt-qb-match.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("alter table receipts add column if not exists qb_txn_id text");
await client.query("alter table receipts add column if not exists qb_matched_at timestamp");
await client.query("alter table receipts add column if not exists qb_matched_by text");
await client.query("alter table receipts add column if not exists qb_coded_at timestamp");
await client.query("create index if not exists receipts_qb_txn_idx on receipts (qb_txn_id)");
const n = await client.query("select count(*)::int n, count(qb_txn_id)::int matched from receipts");
console.log("receipts:", n.rows[0].n, "matched:", n.rows[0].matched);
await client.end();
