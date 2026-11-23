// Additive: billing_tasks.closed (finished task requests) and leak_numbers.task_number (leaks per task request).
// Safe to re-run. Run BEFORE deploying the code.
// Run: node --env-file=.env.local scripts/add-task-request-columns.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("alter table billing_tasks add column if not exists closed boolean not null default false");
await client.query("alter table leak_numbers add column if not exists task_number text");
const a = await client.query("select count(*)::int n from billing_tasks");
const b = await client.query("select count(*)::int n from leak_numbers");
console.log("columns ready; billing_tasks:", a.rows[0].n, "leak_numbers:", b.rows[0].n);
await client.end();
