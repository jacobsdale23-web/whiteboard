// One-off: creates O&M Management's projects from its QuickBooks Projects page (read 2026-10-30, all 19 projects,
// all "In progress" in QuickBooks). Safe to re-run: skips any O&M project whose number (or, if unnumbered, name) exists.
// QuickBooks marks every one In progress, so White Board status is a guess: jobs still active on the Feliciana side
// (26041, 26046, 26091, 26107) and the two ongoing parish accounts are active; the rest are complete.
// Run: node --env-file=.env.local scripts/add-om-projects.mjs [--dry]
import { randomUUID } from "node:crypto";
import pg from "pg";

const dry = process.argv.includes("--dry");

const J = (number, name, customer, status, startDate = null) => ({ number, name, customer, status, startDate });
const JOBS = [
  J("25040", "Taps", "City of Denham Springs", "complete"),
  J("26009", "Leak Repair @ Southern", "Southern University", "complete", "2026-01-28"),
  J("26011", "N Alexander Ave", "City of Port Allen", "complete"),
  J("26012", "Court St & 5th St", "City of New Roads", "complete"),
  J("26013", "Morgan Rd", "Village of Montpelier", "complete"),
  J("26014", "Bridge Bore (1033)", "City of Denham Springs", "complete"),
  J("26015", "Bridge Bore (190)", "City of Denham Springs", "complete"),
  J("26024", `6" Bore`, "Louisiana State Penitentiary", "complete", "2026-02-23"),
  J("26026", "Water Leak Repair", "Louisiana Veterans Home", "complete", "2026-03-13"),
  J("26041", "MovEBR Old Hammond Highway (Seg 2) Gas Relocate", "City of Denham Springs", "active"),
  J("26044", `2" Gas Main Replacement`, "Town of Iota", "complete", "2026-05-11"),
  J("26046", "Denham Springs Services", "City of Denham Springs", "active"),
  J("26051", "Services for Gonzales", "City of Gonzales", "complete", "2026-06-05"),
  J("26054", "Gloster Entergy Gas Service", "Town of Gloster", "complete"),
  J("26071", "Tickfaw River Bore", "Livingston Parish GUD #1", "complete"),
  J("26091", "LA 3127", "LA Contractors", "active", "2026-10-12"),
  J("26107", `8" Sewer Bores`, "Livingston Parish Sewer", "active", "2026-10-20"),
  // QuickBooks projects named for the customer, with no job number: the ongoing parish maintenance accounts.
  J(null, "Livingston Parish GUD #1", "Livingston Parish GUD #1", "active"),
  J(null, "Pointe Coupee Parish", "Pointe Coupee Parish", "active"),
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
let added = 0;
for (const j of JOBS) {
  const exists = j.number
    ? await client.query("select 1 from projects where company_id = 'om' and project_number = $1", [j.number])
    : await client.query("select 1 from projects where company_id = 'om' and project_number is null and name = $1", [j.name]);
  if (exists.rowCount) {
    console.log(`skip ${j.number || j.name}: already exists`);
    continue;
  }
  if (!dry) {
    await client.query(
      `insert into projects (id, company_id, name, status, start_date, end_date, customer, project_number, billing_type, crew)
       values ($1, 'om', $2, $3, $4, null, $5, $6, 'lump_sum', '[]'::jsonb)`,
      [randomUUID(), j.name, j.status, j.startDate, j.customer, j.number]
    );
  }
  added++;
  console.log(`${dry ? "would add" : "added"} ${j.number || "(no number)"} ${j.name} [${j.status}]`);
}
console.log(`${added} project(s) ${dry ? "would be " : ""}added`);
const n = await client.query("select status, count(*)::int n from projects where company_id = 'om' group by 1 order by 1");
console.log("O&M projects now:", JSON.stringify(n.rows));
await client.end();
