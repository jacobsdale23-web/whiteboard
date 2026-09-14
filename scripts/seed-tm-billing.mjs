import { randomUUID } from "node:crypto";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const projects = [
  { id: "atmos-jackson", name: "Atmos T&M - Jackson", location: "Jackson, MS" },
  { id: "atmos-nola-remi", name: "Atmos T&M - New Orleans (Remi's Crew)", location: "New Orleans, LA" },
  { id: "atmos-nola-dustin", name: "Atmos T&M - New Orleans (Dustin's Crew)", location: "New Orleans, LA" },
  { id: "atmos-monroe", name: "Atmos T&M - Monroe", location: "Monroe, LA" },
];

for (const p of projects) {
  await client.query(
    `INSERT INTO projects (id, name, location, status, crew) VALUES ($1,$2,$3,'active','[]')
     ON CONFLICT (id) DO NOTHING`,
    [p.id, p.name, p.location]
  );
}
console.log(`Projects: ${projects.length}`);

// Jackson: Welder $175, everyone else $140. Louisiana (NOLA + Monroe): Welder $143, everyone else $110.
const POSITIONS = ["Foreman", "Operator", "Laborer", "Welder", "Locusview Tech"];
const rateTables = {
  "atmos-jackson": { Welder: 175, default: 140 },
  "atmos-nola-remi": { Welder: 143, default: 110 },
  "atmos-nola-dustin": { Welder: 143, default: 110 },
  "atmos-monroe": { Welder: 143, default: 110 },
};

let rateCount = 0;
for (const [projectId, table] of Object.entries(rateTables)) {
  for (const position of POSITIONS) {
    const rate = table[position] ?? table.default;
    const id = `${projectId}-${position}`.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
    await client.query(
      `INSERT INTO billing_rates (id, project_id, position, hourly_rate) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET hourly_rate = $4`,
      [id, projectId, position, rate]
    );
    rateCount++;
  }
}
console.log(`Billing rates: ${rateCount}`);

// Jackson's three recurring Atmos task numbers, from the current agreement.
const billingTasks = [
  { taskNumber: "070.58526" },
  { taskNumber: "070.58530" },
  { taskNumber: "070.59608" },
].map((t) => ({
  id: randomUUID(),
  projectId: "atmos-jackson",
  taskNumber: t.taskNumber,
  projectName: "2026 SIR Functional Leak Repair / MS26 Func Work",
  taskRequestNo: "FWMS26 Func Work-1",
  contractCoordinator: "Monty McCaleb",
  billToName: "Atmos Energy Corporation\nCost Center 5020 – Michael Abramovich",
  billToAddress: "PO Box 650205\nDallas, TX 75265",
}));

for (const t of billingTasks) {
  const existing = await client.query(`SELECT id FROM billing_tasks WHERE project_id=$1 AND task_number=$2`, [t.projectId, t.taskNumber]);
  if (existing.rows.length) continue;
  await client.query(
    `INSERT INTO billing_tasks (id, project_id, task_number, project_name, task_request_no, contract_coordinator, bill_to_name, bill_to_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [t.id, t.projectId, t.taskNumber, t.projectName, t.taskRequestNo, t.contractCoordinator, t.billToName, t.billToAddress]
  );
}
console.log(`Billing tasks: ${billingTasks.length}`);

// Jackson crew roster (foremen + their crews), so they're selectable on daily logs.
const crewNames = [
  "Cavin Pritchard", "James Aaron", "Richard Mayer", "Stone Reynolds", "Taylor Manuel",
  "Aaron Loper", "Alfonso Arteaga", "Andrew Reno", "Benjamin Nelson", "Caleb Guidry",
  "Chaz Parker", "Colby Morris", "Ethan Mills", "James Lindsay", "Jamie Picou",
  "John Fontenot", "Juan Rubio", "Kenneth Collins", "Kobey Lowman", "Kyler King",
  "Logan Willey", "Rodrick Boss",
];
let crewCount = 0;
for (const name of crewNames) {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await client.query(`INSERT INTO crew (id, name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING`, [id, name]);
  crewCount++;
}
console.log(`Crew roster additions: ${crewCount}`);

await client.end();
console.log("T&M billing seed complete.");
