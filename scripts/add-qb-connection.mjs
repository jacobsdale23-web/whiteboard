// Additive: the QuickBooks Online connection per company, and where a T&M invoice went in QuickBooks. Safe to re-run.
// Run BEFORE deploying the code. Run: node --env-file=.env.local scripts/add-qb-connection.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`create table if not exists qb_connections (
  company_id text primary key,
  realm_id text not null,
  company_name text,
  access_token text not null,
  refresh_token text not null,
  access_expires_at timestamp not null,
  refresh_expires_at timestamp not null,
  connected_by text,
  connected_at timestamp not null default now()
)`);
await client.query("alter table tm_invoices add column if not exists qb_invoice_id text");
await client.query("alter table tm_invoices add column if not exists qb_sent_at timestamp");
await client.query("alter table tm_invoices add column if not exists qb_sent_by text");
const n = await client.query("select count(*)::int n from tm_invoices");
console.log("qb connection tables ready; tm_invoices rows:", n.rows[0].n);
await client.end();
