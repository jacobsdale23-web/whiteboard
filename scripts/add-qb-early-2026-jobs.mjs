// One-off: adds early-2026 QuickBooks jobs (26002-26032) that carry income but were
// never entered in White Board, as billed projects so the Completed list matches
// QuickBooks. Value is the income QuickBooks shows for the job. Safe to re-run.
// Run: node --env-file=.env.local scripts/add-qb-early-2026-jobs.mjs
import { randomUUID } from "node:crypto";
import pg from "pg";

// number, name, customer, start, end, QuickBooks income
const JOBS = [
  ["26002", "Jefferson Drainage Offset", "Atmos Energy Corporation", "2026-01-05", null, 37416.98],
  ["26003", "Leak Repair", "Town of Washington", "2026-01-08", "2026-01-09", 18365.0],
  ["26004", "Jimmy Swaggart Chiller Replacement", "Bayou Lacombe Construction Company", "2026-01-09", null, 70000.0],
  ["26005", "Oak Ridge Ph 3, Violet", "Atmos Energy Corporation", "2026-01-12", null, 99367.99],
  ["26009", "Leak Repair @ Southern", "Southern University", "2026-01-28", null, 13835.0],
  ["26010", "Miller Pipeline Riser Coating", "Atmos Energy Corporation", "2026-02-02", null, 6600.0],
  ["26011", "N Alexander Ave", "City of Port Allen", "2026-02-02", null, 29590.0],
  ["26014", "Bridge Bore (1033)", "City of Denham Springs", "2026-02-18", null, 59651.0],
  ["26015", "Bridge Bore (190)", "City of Denham Springs", "2026-02-18", null, 57766.0],
  ["26018", "Leak Repair", "Kentwood Brick", "2026-02-12", null, 3750.0],
  ["26022", "Chauvin Ph1", "Atmos Energy Corporation", "2026-02-23", null, 124025.0],
  ["26023", `Pennington 5" Steel Offset (Ph 2)`, "Bayou Lacombe Construction Company", "2026-02-23", null, 47000.0],
  ["26024", `6" Bore`, "Louisiana State Penitentiary", "2026-02-24", null, 97275.0],
  ["26025", `4" Mueller Taps`, "System Services Pipeline, LLC", "2026-03-06", null, 4800.0],
  ["26026", "Water Leak Repair", "Louisiana Veterans Home", "2026-03-13", null, 3250.0],
  ["26028", `4" TDW Tap Tee`, "Smith Meter, Inc. SMR", "2026-03-16", "2026-03-16", 10659.0],
  ["26029", "Emergency Gas Leak Repair", "Mississippi River Gas, LLC.", "2026-03-16", "2026-03-16", 9365.0],
  ["26032", "PVC Leak Repair", "Town of Clinton", "2026-04-06", null, 21000.0],
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let added = 0;
for (const [number, name, customer, start, end, income] of JOBS) {
  const exists = await client.query("select 1 from projects where project_number = $1", [number]);
  if (exists.rowCount) {
    console.log(`skip ${number}: already exists`);
    continue;
  }
  await client.query(
    `insert into projects (id, company_id, name, status, start_date, end_date, customer, project_number, billing_type, value, crew)
     values ($1, 'fwi', $2, 'billed', $3, $4, $5, $6, 'lump_sum', $7, '[]'::jsonb)`,
    [randomUUID(), name, start, end, customer, number, income]
  );
  added++;
}
console.log(`added ${added} project(s)`);
const check = await client.query(
  "select project_number, name, customer, status, value from projects where project_number = any($1) order by project_number",
  [JOBS.map((j) => j[0])]
);
console.table(check.rows);
await client.end();
