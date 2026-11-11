// Additive: two small tables for the Capital One statement tool. Safe to re-run. Run BEFORE deploying the code.
//   card_line_jobs: a statement line assigned to a job by hand.
//   card_vendor_rules: "always use this job for this vendor".
// Run: node --env-file=.env.local scripts/add-card-assignments.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`create table if not exists card_line_jobs (
  key text primary key, company_id text not null, project_id text not null, date text, description text,
  amount numeric, card text, set_by text not null, set_at timestamp not null default now())`);
await client.query(`create table if not exists card_vendor_rules (
  id text primary key, company_id text not null, pattern text not null, label text not null, project_id text not null,
  created_by text not null, created_at timestamp not null default now())`);
await client.query("create unique index if not exists card_vendor_rules_pattern_idx on card_vendor_rules (company_id, pattern)");
const a = await client.query("select count(*)::int n from card_line_jobs");
const b = await client.query("select count(*)::int n from card_vendor_rules");
console.log("card_line_jobs:", a.rows[0].n, "card_vendor_rules:", b.rows[0].n);
await client.end();
