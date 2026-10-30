// Additive: QuickBooks invoices copied into White Board so a job can list what was billed. Safe to re-run.
// Run BEFORE deploying the code. Run: node --env-file=.env.local scripts/add-qb-invoices.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`create table if not exists qb_invoices (
  company_id text not null,
  invoice_no text not null,
  project_number text,
  customer text,
  txn_date text,
  amount numeric not null default 0,
  balance numeric not null default 0,
  memo text,
  link text,
  synced_at timestamp not null default now(),
  primary key (company_id, invoice_no)
)`);
await client.query("create index if not exists qb_invoices_job_idx on qb_invoices (company_id, project_number)");
const n = await client.query("select count(*)::int n from qb_invoices");
console.log("qb_invoices ready; rows:", n.rows[0].n);
await client.end();
