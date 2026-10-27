// One-off: adds QuickBooks jobs (26xxx) that were missing from White Board, and
// numbers one existing job. Safe to re-run: skips anything whose number exists.
// Run: node --env-file=.env.local scripts/add-qb-recent-jobs.mjs
import { randomUUID } from "node:crypto";
import pg from "pg";

const NEW_JOBS = [
  { number: "26108", name: `Atmos 3/4" Taps`, customer: "Atmos Energy Corporation", status: "active", startDate: "2026-10-26", endDate: "2026-10-27" },
  { number: "26092", name: "Sawgrass LNG", customer: "Kinghorn Construction Group", status: "upcoming", startDate: "2026-09-10", endDate: null },
  { number: "26081", name: "Wellcome Country Store Gas Service", customer: "Legends Development", status: "upcoming", startDate: null, endDate: null },
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

for (const j of NEW_JOBS) {
  const exists = await client.query("select 1 from projects where project_number = $1", [j.number]);
  if (exists.rowCount) {
    console.log(`skip ${j.number}: already exists`);
    continue;
  }
  await client.query(
    `insert into projects (id, company_id, name, status, start_date, end_date, customer, project_number, billing_type, crew)
     values ($1, 'fwi', $2, $3, $4, $5, $6, $7, 'lump_sum', '[]'::jsonb)`,
    [randomUUID(), j.name, j.status, j.startDate, j.endDate, j.customer, j.number]
  );
  console.log(`added ${j.number} ${j.name}`);
}

// Already in White Board as an upcoming job with no number.
const num = await client.query(
  `update projects set project_number = '26106'
   where name = 'Artigues 2" Service' and customer = 'Artigues Construction' and project_number is null
     and not exists (select 1 from projects where project_number = '26106')`
);
console.log(`numbered Artigues 2" Service as 26106: ${num.rowCount} row(s)`);

const check = await client.query(
  "select project_number, name, status, customer, start_date, end_date, billing_type, company_id from projects where project_number in ('26081','26092','26106','26108') order by project_number"
);
console.table(check.rows);
await client.end();
