// Additive: creates the qb_jobs table (QuickBooks per-job income/cost totals).
// Run: node --env-file=.env.local scripts/add-qb-jobs.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`
  create table if not exists qb_jobs (
    project_number text primary key,
    name text not null,
    customer text,
    status text,
    start_date text,
    end_date text,
    income numeric not null default 0,
    cost numeric not null default 0,
    hours numeric,
    synced_at timestamp not null default now()
  )
`);
console.log("qb_jobs ready");
await client.end();
