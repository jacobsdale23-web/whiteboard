// Additive: the per-person job schedule (crew_schedule). Safe to re-run. Run BEFORE deploying the code.
// Run: node --env-file=.env.local scripts/add-crew-schedule.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`create table if not exists crew_schedule (
  id text primary key,
  company_id text not null,
  project_id text not null,
  person text not null,
  start_date text not null,
  end_date text not null,
  location text,
  task_number text,
  note text,
  created_at timestamp not null default now()
)`);
await client.query("create index if not exists crew_schedule_company_dates_idx on crew_schedule (company_id, end_date)");
await client.query("create index if not exists crew_schedule_project_idx on crew_schedule (project_id)");
const n = await client.query("select count(*)::int n from crew_schedule");
console.log("crew schedule ready; rows:", n.rows[0].n);
await client.end();
