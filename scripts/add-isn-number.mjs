// Additive: an ISN (ISNetworld) number on each HR employee. Safe to re-run.
// Run BEFORE deploying the code. Run: node --env-file=.env.local scripts/add-isn-number.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("alter table hr_employees add column if not exists isn_number text");
const n = await client.query("select count(*)::int n, count(isn_number)::int with_isn from hr_employees");
console.log("hr_employees:", n.rows[0].n, "with ISN:", n.rows[0].with_isn);
await client.end();
