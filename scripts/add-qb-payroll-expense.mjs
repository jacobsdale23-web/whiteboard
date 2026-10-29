// Adds (or refreshes) one "Payroll (QuickBooks job cost)" expense on a White Board project from the
// QuickBooks totals in qb_jobs. Only touches expenses rows with that description prefix.
// Usage: node --env-file=.env.local scripts/add-qb-payroll-expense.mjs <projectNumber> [--dry]
import { randomUUID } from "node:crypto";
import pg from "pg";

const number = process.argv[2];
if (!number) throw new Error("Pass the QuickBooks project number.");
const dry = process.argv.includes("--dry");
const PREFIX = "Payroll (QuickBooks job cost";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const qb = (await client.query("select cost, hours, synced_at from qb_jobs where project_number = $1", [number])).rows[0];
  if (!qb) throw new Error(`No QuickBooks totals for ${number}.`);
  const projects = (await client.query("select id, name from projects where project_number = $1", [number])).rows;
  if (projects.length !== 1) throw new Error(`Expected exactly one White Board project numbered ${number}, found ${projects.length}.`);
  const p = projects[0];

  const synced = new Date(qb.synced_at);
  const dateStr = synced.toISOString().slice(0, 10);
  const label = `${PREFIX}, ${qb.hours ? Number(qb.hours).toLocaleString("en-US") + " hrs, " : ""}synced ${dateStr})`;
  const existing = (await client.query("select id, amount from expenses where project_id = $1 and description like $2", [p.id, PREFIX + "%"])).rows;
  console.log(`${p.name}: QuickBooks cost ${qb.cost} (${dateStr}); existing payroll rows: ${existing.length}`);
  if (dry) process.exit(0);

  if (existing.length) {
    await client.query("update expenses set amount = $1, date = $2, description = $3 where id = $4", [qb.cost, dateStr, label, existing[0].id]);
    console.log("updated existing payroll expense");
  } else {
    await client.query("insert into expenses (id, project_id, date, description, amount) values ($1,$2,$3,$4,$5)", [randomUUID(), p.id, dateStr, label, qb.cost]);
    console.log("added payroll expense");
  }
} finally {
  await client.end();
}
