// One-off: correct White Board's Old Hammond Hwy (26041) pay app data to match the approved Pay App 2 / corrected Pay Apps 3 and 4.
//   - baselines (progress through approved Pay App 2): 1A 0.75, 8 Bond Wire 2,840, 8A 1,325
//   - add Pay App 4 (corrected quantities)
//   - project value = current contract price 914,724.22 (the $43,125 paid outside the contract is not part of it)
// Usage: node --env-file=.env.local scripts/fix-payapp-26041.mjs [--dry] <backup.json>
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

const dry = process.argv.includes("--dry");
const backupPath = process.argv.filter((a) => !a.startsWith("--")).pop();
const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BASELINES = { "1A": 0.75, "8": 2840, "8A": 1325 };
const APP4 = { appNumber: "4", period: "9/1/26 - 9/30/26", applicationDate: "10/19/2026", retainage: 5 };
const APP4_QTY = { "6": 1, "15": 0.5, "20": 650, "21": 2, "22": 2 };
const NEW_VALUE = 914724.22;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

async function rollups(projectId) {
  const apps = (await client.query("select id, app_number, retainage_percent from pay_apps where project_id = $1", [projectId])).rows.sort((a, b) => Number(a.app_number) - Number(b.app_number));
  const items = (await client.query("select item_no, bid_qty, unit_price, baseline_qty from sov_items where project_id = $1", [projectId])).rows;
  const entries = (await client.query("select pay_app_id, item_no, period_qty, stored from sov_entries where project_id = $1", [projectId])).rows;
  const completedAt = (idx) => {
    let total = 0;
    for (const it of items) {
      let qty = Number(it.baseline_qty) || 0;
      let stored = 0;
      for (let i = 0; i <= idx; i++) {
        const e = entries.find((x) => x.item_no === it.item_no && x.pay_app_id === apps[i].id);
        if (e) { qty += Number(e.period_qty) || 0; if (i === idx) stored = Number(e.stored) || 0; }
      }
      total += qty * Number(it.unit_price) + stored;
    }
    return total;
  };
  const baselineValue = items.reduce((s, it) => s + (Number(it.baseline_qty) || 0) * (Number(it.unit_price) || 0), 0);
  const contract = items.reduce((s, it) => s + (Number(it.bid_qty) || 0) * (Number(it.unit_price) || 0), 0);
  return apps.map((a, idx) => {
    const ret = Number(a.retainage_percent) / 100;
    const completed = completedAt(idx);
    const prev = idx > 0 ? completedAt(idx - 1) : baselineValue;
    return { app: a.app_number, contract, completed, prior: prev, gross: completed - prev, eligible: completed * (1 - ret), due: completed * (1 - ret) - prev * (1 - ret) };
  });
}

try {
  const [project] = (await client.query("select id, name, value from projects where project_number = '26041'")).rows;
  if (!project) throw new Error("project 26041 not found");
  const existingApps = (await client.query("select * from pay_apps where project_id = $1", [project.id])).rows;
  if (existingApps.some((a) => a.app_number === APP4.appNumber)) throw new Error("Pay App 4 already exists; refusing to run twice.");

  const backup = {
    takenAt: new Date().toISOString(),
    project,
    pay_apps: existingApps,
    sov_items: (await client.query("select * from sov_items where project_id = $1", [project.id])).rows,
    sov_entries: (await client.query("select * from sov_entries where project_id = $1", [project.id])).rows,
  };
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log("backup written:", backupPath);
  console.log("BEFORE:", (await rollups(project.id)).map((r) => `App ${r.app}: completed ${money(r.completed)} due ${money(r.due)}`).join(" | "), "| project value", project.value);

  await client.query("begin");
  for (const [itemNo, qty] of Object.entries(BASELINES)) {
    const r = await client.query("update sov_items set baseline_qty = $1 where project_id = $2 and item_no = $3", [qty, project.id, itemNo]);
    if (r.rowCount !== 1) throw new Error(`baseline update for item ${itemNo} touched ${r.rowCount} rows`);
  }
  const appId = randomUUID();
  await client.query(
    "insert into pay_apps (id, project_id, app_number, period, application_date, retainage_percent) values ($1,$2,$3,$4,$5,$6)",
    [appId, project.id, APP4.appNumber, APP4.period, APP4.applicationDate, APP4.retainage]
  );
  const items = (await client.query("select item_no from sov_items where project_id = $1", [project.id])).rows;
  for (const it of items) {
    await client.query("insert into sov_entries (id, project_id, pay_app_id, item_no, period_qty, stored) values ($1,$2,$3,$4,$5,0)", [randomUUID(), project.id, appId, it.item_no, APP4_QTY[it.item_no] ?? 0]);
  }
  await client.query("update projects set value = $1 where id = $2", [NEW_VALUE, project.id]);

  const after = await rollups(project.id);
  console.log("AFTER :", after.map((r) => `App ${r.app}: completed ${money(r.completed)} | gross this period ${money(r.gross)} | due ${money(r.due)}`).join("\n         "));
  console.log("contract price (sum of items):", money(after[0].contract));

  if (dry) { await client.query("rollback"); console.log("DRY RUN: rolled back, nothing changed."); }
  else { await client.query("commit"); console.log("COMMITTED."); }
} catch (e) {
  try { await client.query("rollback"); } catch {}
  console.error("FAILED, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
