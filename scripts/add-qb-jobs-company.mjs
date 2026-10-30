// Additive: qb_jobs gets a company_id (existing rows become 'fwi') and its key becomes (company_id, project_number),
// because O&M's QuickBooks uses the same job numbers as Feliciana Welders' for the same jobs.
// Safe to re-run. Run BEFORE deploying code that filters qb_jobs by company.
// Run: node --env-file=.env.local scripts/add-qb-jobs-company.mjs
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("begin");
await client.query("alter table qb_jobs add column if not exists company_id text not null default 'fwi'");
await client.query("alter table qb_jobs drop constraint if exists qb_jobs_pkey");
await client.query("alter table qb_jobs add primary key (company_id, project_number)");
await client.query("commit");
const n = await client.query("select company_id, count(*)::int n from qb_jobs group by 1 order by 1");
console.log("qb_jobs ready:", JSON.stringify(n.rows));
await client.end();
