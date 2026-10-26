// One-off: moves every project with status "complete" to "billed" so they leave
// the calendar timeline. Dry run by default; pass --apply to write.
// Run: node --env-file=.env.local scripts/mark-complete-billed.mjs [--apply]
import pg from "pg";

const apply = process.argv.includes("--apply");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(
  "select id, company_id, name, project_number, end_date from projects where status = 'complete' order by company_id, end_date nulls last, name"
);
console.log(`${rows.length} complete project(s):`);
for (const r of rows) console.log(` ${r.company_id.padEnd(7)} ${String(r.project_number ?? "").padEnd(9)} ${r.name}  (end ${r.end_date ?? "—"})`);

if (apply && rows.length) {
  const res = await client.query("update projects set status = 'billed' where status = 'complete'");
  console.log(`\nMarked ${res.rowCount} project(s) billed.`);
} else {
  console.log("\nDry run. Re-run with --apply to write.");
}
const after = await client.query("select company_id, status, count(*)::int n from projects group by 1, 2 order by 1, 2");
console.table(after.rows);
await client.end();
