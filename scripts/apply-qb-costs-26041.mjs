// One-off: bring Old Hammond Hwy (26041) job costs from QuickBooks into White Board without double counting.
// QuickBooks' project Costs ($186,308.09 on 2026-10-29) = vendor bills + payroll, so:
//   - the three vendor bills become White Board vendor invoices
//   - the "Payroll (QuickBooks job cost...)" expense becomes Costs minus those bills
// Usage: node --env-file=.env.local scripts/apply-qb-costs-26041.mjs [--dry]
import { randomUUID } from "node:crypto";
import pg from "pg";

const dry = process.argv.includes("--dry");
const QB_COSTS = 186308.09;
const BILLS = [
  { invoiceNumber: "P2602515", vendor: "MESA", date: "2026-04-30", amount: 16887.01, category: "Materials" },
  { invoiceNumber: "2771", vendor: "NUCO Directional Drilling, LLC", date: "2026-08-24", amount: 84480.0, category: "Subcontractor" },
  { invoiceNumber: "2772", vendor: "NUCO Directional Drilling, LLC", date: "2026-08-28", amount: 12000.0, category: "Subcontractor" },
];
const billsTotal = BILLS.reduce((s, b) => s + b.amount, 0);
const payroll = Math.round((QB_COSTS - billsTotal) * 100) / 100;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const projects = (await client.query("select id, name from projects where project_number = '26041'")).rows;
  if (projects.length !== 1) throw new Error(`expected one project 26041, found ${projects.length}`);
  const pid = projects[0].id;
  await client.query("begin");

  for (const b of BILLS) {
    const have = await client.query("select id from invoices where project_id = $1 and invoice_number = $2 and vendor = $3", [pid, b.invoiceNumber, b.vendor]);
    if (have.rowCount) { console.log("already there:", b.vendor, b.invoiceNumber); continue; }
    await client.query("insert into invoices (id, project_id, invoice_number, vendor, date, amount, category) values ($1,$2,$3,$4,$5,$6,$7)", [randomUUID(), pid, b.invoiceNumber, b.vendor, b.date, b.amount, b.category]);
    console.log("added invoice:", b.vendor, b.invoiceNumber, b.amount, b.category);
  }

  const desc = "Payroll (QuickBooks job cost less vendor bills, as of 2026-10-29)";
  const r = await client.query("update expenses set amount = $1, date = '2026-10-29', description = $2 where project_id = $3 and description like 'Payroll (QuickBooks job cost%'", [payroll, desc, pid]);
  if (r.rowCount !== 1) throw new Error(`expected to update exactly one payroll expense, updated ${r.rowCount}`);
  console.log(`payroll expense set to ${payroll} (QuickBooks costs ${QB_COSTS} - bills ${billsTotal.toFixed(2)})`);

  const tot = (await client.query(
    "select (select coalesce(sum(amount),0) from expenses where project_id=$1) e, (select coalesce(sum(amount),0) from invoices where project_id=$1) i, (select coalesce(sum(amount),0) from receipts where project_id=$1) r", [pid])).rows[0];
  console.log(`White Board cost after: expenses ${tot.e} + invoices ${tot.i} + receipts ${tot.r} = ${(Number(tot.e) + Number(tot.i) + Number(tot.r)).toFixed(2)}`);

  if (dry) { await client.query("rollback"); console.log("DRY RUN: rolled back."); }
  else { await client.query("commit"); console.log("COMMITTED."); }
} catch (e) {
  try { await client.query("rollback"); } catch {}
  console.error("FAILED, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
