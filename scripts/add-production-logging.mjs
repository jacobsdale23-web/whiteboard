// Additive: production quantities on daily logs, a unit of measure on line items, and the date range a pay app was
// generated from (so the same daily logs aren't billed twice). Safe to re-run. Run BEFORE deploying the code.
// Run: node --env-file=.env.local scripts/add-production-logging.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("alter table sov_items add column if not exists unit text");
await client.query("alter table line_items add column if not exists unit text");
await client.query("alter table daily_logs add column if not exists quantities jsonb not null default '[]'::jsonb");
await client.query("alter table pay_apps add column if not exists log_from text");
await client.query("alter table pay_apps add column if not exists log_to text");
const n = await client.query("select count(*)::int n from daily_logs");
console.log("production logging columns ready; daily_logs rows:", n.rows[0].n);
await client.end();
