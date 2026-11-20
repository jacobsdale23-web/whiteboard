// Additive: pictures on daily logs (daily_logs.photos). Safe to re-run. Run BEFORE deploying the code.
// Run: node --env-file=.env.local scripts/add-log-photos.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("alter table daily_logs add column if not exists photos jsonb not null default '[]'::jsonb");
const n = await client.query("select count(*)::int n from daily_logs");
console.log("daily_logs.photos ready; logs:", n.rows[0].n);
await client.end();
