// Additive: a project's kind (standard / hot tap / FWI hot tap) and, for an FWI hot tap, the job it is billed through.
// Every existing project becomes "standard". Safe to re-run.
// Run BEFORE deploying the code. Run: node --env-file=.env.local scripts/add-job-kind.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("alter table projects add column if not exists job_kind text not null default 'standard'");
await client.query("alter table projects add column if not exists billed_through_project_id text");
const n = await client.query("select job_kind, count(*)::int n from projects group by job_kind order by job_kind");
console.log("projects by kind:", JSON.stringify(n.rows));
await client.end();
