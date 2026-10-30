// Additive: the QuickBooks quote kept with a small job (project_quotes) and a "scope changed" flag on daily logs.
// Safe to re-run. Run BEFORE deploying the code.
// Run: node --env-file=.env.local scripts/add-project-quotes.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`create table if not exists project_quotes (
  id text primary key,
  project_id text not null,
  number text not null,
  quote_date text,
  customer text,
  total numeric not null default 0,
  status text not null default 'Pending',
  expires text,
  qb_link text,
  lines jsonb not null default '[]'::jsonb,
  file_id text,
  billed_invoice_no text,
  billed_date text,
  billed_amount numeric,
  billed_by text,
  created_at timestamp not null default now()
)`);
await client.query("create index if not exists project_quotes_project_idx on project_quotes (project_id)");
await client.query("alter table daily_logs add column if not exists scope_change boolean not null default false");
const n = await client.query("select count(*)::int n from project_quotes");
console.log("project quotes ready; rows:", n.rows[0].n);
await client.end();
