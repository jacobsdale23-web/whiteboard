// Additive: a project manager (PM) on every job, and the pool of PMs to pick from. Safe to re-run.
// Seeds the pool (Jacob, Daryl, Chris, Cavin, Ross) and carries each converted job's estimator over as its PM.
// Run BEFORE deploying the code. Run: node --env-file=.env.local scripts/add-project-managers.mjs
import { randomUUID } from "node:crypto";
import pg from "pg";

const POOL = ["Jacob", "Daryl", "Chris", "Cavin", "Ross"];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("alter table projects add column if not exists pm text");
await client.query("create table if not exists project_managers (id text primary key, name text not null, active boolean not null default true)");
await client.query("create unique index if not exists project_managers_name_idx on project_managers (lower(name))");

for (const name of POOL) {
  await client.query("insert into project_managers (id, name, active) values ($1, $2, true) on conflict (lower(name)) do nothing", [randomUUID(), name]);
}

// Jobs that came from a won opportunity keep the estimator as PM (only when that estimator is in the pool, and never over a PM already set).
const filled = await client.query(`
  update projects p set pm = pm_pool.name
  from opportunities o
  join project_managers pm_pool on lower(pm_pool.name) = lower(o.estimator)
  where o.converted_project_id = p.id and p.pm is null`);
const s = await client.query("select count(*)::int n, count(pm)::int with_pm from projects");
console.log("pool:", (await client.query("select name from project_managers order by name")).rows.map((r) => r.name).join(", "));
console.log("filled from estimator:", filled.rowCount, "| projects:", s.rows[0].n, "with a PM:", s.rows[0].with_pm);
await client.end();
