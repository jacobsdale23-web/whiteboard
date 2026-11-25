// Additive: meeting time and attendees on opportunities. Safe to re-run. Run BEFORE deploying the code.
// Run: node --env-file=.env.local scripts/add-meeting-fields.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("alter table opportunities add column if not exists meeting_time text");
await client.query("alter table opportunities add column if not exists attendees jsonb not null default '[]'::jsonb");
const n = await client.query("select count(*)::int n from opportunities");
console.log("meeting columns ready; opportunities:", n.rows[0].n);
await client.end();
