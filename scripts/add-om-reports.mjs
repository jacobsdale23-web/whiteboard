// Additive: O&M field reports (one per job, only the sections that job type needs). Photos live in the private
// bucket; this table records their keys. Run this before deploying code that reads om_reports.
// Usage: node --env-file=.env.local scripts/add-om-reports.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(`create table if not exists om_reports (
    id text primary key,
    project_id text not null,
    date text not null,
    job_type text not null,
    extras jsonb default '[]'::jsonb,
    data jsonb default '{}'::jsonb,
    photos jsonb default '[]'::jsonb,
    technician text,
    signature text,
    submitted_by text,
    created_at timestamp not null default now(),
    edited_at timestamp,
    edited_by text
  )`);
  await client.query("create index if not exists om_reports_project_idx on om_reports (project_id)");
  const r = await client.query("select count(*)::int n from om_reports");
  console.log("om_reports ready; rows:", r.rows[0].n);
} finally {
  await client.end();
}
