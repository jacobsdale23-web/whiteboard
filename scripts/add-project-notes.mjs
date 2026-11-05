// Additive: the office's notes for the crew on a project (phone numbers, info about the job). Safe to re-run.
// Run BEFORE deploying the code. Run: node --env-file=.env.local scripts/add-project-notes.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("alter table projects add column if not exists notes text");
const n = await client.query("select count(*)::int n, count(notes)::int with_notes from projects");
console.log("projects:", n.rows[0].n, "with notes:", n.rows[0].with_notes);
await client.end();
