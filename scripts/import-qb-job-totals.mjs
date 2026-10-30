// Upserts QuickBooks per-job totals into qb_jobs. Only touches qb_jobs.
// Input: one line per job, "number|name|customer|start|end|status|income|cost|hours"
// (start/end as YYYY-MM-DD or blank; income/cost as plain numbers).
// Run: node --env-file=.env.local scripts/import-qb-job-totals.mjs <file> [--company fwi|om] [--dry]
// --company says whose QuickBooks the file came from (default fwi). Only fwi lines are held to the
// numbered-job format; another company's QuickBooks projects with no number use their name as the key.
import fs from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) throw new Error("Pass the totals file as the first argument.");
const dry = process.argv.includes("--dry");
const ci = process.argv.indexOf("--company");
const company = ci > 0 ? process.argv[ci + 1] : "fwi";
if (!/^[a-z]+$/.test(company || "")) throw new Error("--company needs a company id such as fwi or om.");

const rows = fs
  .readFileSync(file, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => {
    const [num, name, customer, start, end, status, income, cost, hours] = l.split("|").map((s) => s.trim());
    return { num, name, customer, start: start || null, end: end || null, status: status || null, income: Number(income) || 0, cost: Number(cost) || 0, hours: hours === "" || hours === undefined ? null : Number(hours) };
  })
  .filter((r) => (company === "fwi" ? /^(\d{5}|\d{2}[A-Za-z]{3,10})$/.test(r.num) : !!r.num));

console.log(`${rows.length} job(s) read for ${company}; total income $${rows.reduce((a, r) => a + r.income, 0).toFixed(2)}, total cost $${rows.reduce((a, r) => a + r.cost, 0).toFixed(2)}`);
if (dry) process.exit(0);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
for (const r of rows) {
  await client.query(
    `insert into qb_jobs (company_id, project_number, name, customer, status, start_date, end_date, income, cost, hours, synced_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     on conflict (company_id, project_number) do update set
       name = excluded.name, customer = excluded.customer, status = excluded.status,
       start_date = excluded.start_date, end_date = excluded.end_date,
       income = excluded.income, cost = excluded.cost, hours = excluded.hours, synced_at = now()`,
    [company, r.num, r.name, r.customer, r.status, r.start, r.end, r.income, r.cost, r.hours]
  );
}
const n = await client.query("select count(*)::int n from qb_jobs where company_id = $1", [company]);
console.log(`upserted ${rows.length}; qb_jobs now has ${n.rows[0].n} row(s) for ${company}`);
await client.end();
