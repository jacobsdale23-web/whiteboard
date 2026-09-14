import { randomUUID } from "node:crypto";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// ---------- projects (live artifact state as of this migration) ----------
const projects = [
  { id: "chathom-chilchrist", name: "Gilchrist", location: "Chathom, LA", status: "active", endDate: "2026-09-18", value: null, crew: ["Cade"] },
  { id: "denham-old-hammond", name: "Old Hammond Hwy", location: "Denham Springs, LA", status: "active", endDate: "2026-10-31", value: 957849.22, crew: ["Remi", "Dustin"] },
  { id: "denham-river-rd", name: "River Rd", location: "Denham Springs, LA", status: "active", endDate: "2026-09-25", value: null, crew: ["Dustin"] },
  { id: "donaldsville-1a", name: "1a", location: "Donaldsville, LA", status: "complete", endDate: null, value: null, crew: [] },
  { id: "donaldsville-hud", name: "Hud", location: "Donaldsville, LA", status: "active", endDate: "2027-02-01", value: null, crew: ["Zack", "Dylan"] },
  { id: "donaldsville-phase3", name: "Phase 3", location: "Donaldsville, LA", status: "active", endDate: "2026-09-30", value: null, crew: ["Jonathon"] },
  { id: "donaldsville-round2b", name: "Round 2B", location: "Donaldsville, LA", status: "active", endDate: "2027-07-01", value: null, crew: ["Zack", "Dylan"] },
  { id: "iota-main-ext", name: "Main Extension", location: "Iota, LA", status: "active", endDate: "2026-09-14", value: null, crew: ["Ben", "Tim"] },
  { id: "livingston-gas-main", name: "Gas Main Relocation", location: "Livingston, LA", status: "active", endDate: "2026-10-31", value: 580000, crew: ["Ben"] },
  { id: "upcoming-alexandria", name: "Alexandria 4", location: "", status: "upcoming", startDate: "2026-10-05", duration: "120 Days", value: 305000, crew: ["Chad"] },
  { id: "upcoming-la3127", name: "LA 3127", location: null, status: "upcoming", startDate: "2026-10-01", duration: "60 Days", value: 610710, crew: [] },
  { id: "upcoming-la70", name: "LA 70 Rehab", location: null, status: "upcoming", startDate: "2026-11-01", duration: "60 Days", value: 905558, crew: [] },
  { id: "westlake-oderizer", name: "Oderizer Install", location: "West Lake, LA", status: "active", endDate: "2026-09-25", value: null, crew: ["Chad"] },
];

const crewMembers = [
  { id: "jonathon", name: "Jonathon" },
  { id: "zack", name: "Zack" },
  { id: "dylan", name: "Dylan" },
  { id: "cade", name: "Cade" },
  { id: "remi", name: "Remi" },
  { id: "dustin", name: "Dustin" },
  { id: "ben", name: "Ben" },
  { id: "tim", name: "Tim" },
  { id: "chad", name: "Chad" },
  { id: "fx6c7cxnvaosurjsh8gs", name: "Burlon" },
];

const opportunities = [
  { id: randomUUID(), kind: "Opportunity", oppType: "Bid Job", jobName: "Berwick Gas Line Replacement", estimator: "Jacob", bidDueDate: "2026-10-06", customer: "", location: "Berwick, LA", bidValue: null, bidStatus: "Open" },
  { id: randomUUID(), kind: "Opportunity", oppType: "Bid Job", jobName: "Atmos Bridge Connection", estimator: "Jacob", bidDueDate: "2026-09-17", customer: "Atmos", location: "Bridge City, LA", bidValue: null, bidStatus: "Open" },
  { id: randomUUID(), kind: "Opportunity", oppType: "Bid Job", jobName: "Alexandria 1 Year Contract", estimator: "Jacob", bidDueDate: "2026-09-17", customer: "City of Alexandria", location: "Alexandria, LA", bidValue: null, bidStatus: "Open" },
];

const payAppId = randomUUID();
const payApp = { id: payAppId, projectId: "denham-old-hammond", appNumber: "3", period: "8/1/26 - 8/31/26", applicationDate: "2026-09-01", retainagePercent: 5 };

// [itemNo, description, bidQty, unitPrice, baselineQty, periodQty, stored]
const sovRows = [
  ["6", "8\" In-Line Valves & Fittings", 3, 10291.42, 2, 0, 0],
  ["10", "Erosion Control & Restoration", 1, 5856, 0, 0, 0],
  ["1A", "2026 - Mob/Demob", 1, 58650, 0.5, 0, 0],
  ["5", "8\" Steel Hot Tap & Fittings", 0, 0, 0, 0, 0],
  ["15", "Excavate and Clamp 8\"", 1, 71096, 0, 0, 0],
  ["3", "Disconnect Existing 2\" line & reconnect 8\" PE Main", 1, 21999.49, 0, 0, 0],
  ["4", "Disconnect Existing 3/4\" service lines & reconnect to 8\" main", 17, 2909.91, 0, 0, 0],
  ["7", "Install Valve Markers @ Valve Locations", 3, 484.54, 1, 0, 0],
  ["8", "Bond Wire", 2840, 5, 0, 0, 0],
  ["8A", "2026 - Bond Wire", 1445, 13.33, 1345, 0, 0],
  ["9", "Disconnect 8\" Main & Abandon", 1, 31716.28, 0, 0, 0],
  ["21", "Pre-Purchased Materials - Two (2) 8\"", 2, 3187.5, 0, 0, 0],
  ["18", "Re-Pig 8\"", 16, 120, 0, 16, 0],
  ["2", "8\" PE Gas Main (Bore)", 2840, 80, 2840, 0, 0],
  ["1", "Mob/Demob", 1, 50000, 1, 0, 0],
  ["22", "Pre-Purchased Materials - Two (2) 8\"", 2, 481.25, 0, 0, 0],
  ["2A", "2026 - 8\" PE Gas Main", 1325, 93.51, 1325, 0, 0],
  ["12", "Drill 2\"", 570, 35, 0, 0, 0],
  ["20", "Pre Purchased Materials - 650LF 2/0 Bond Wire", 650, 10, 0, 0, 0],
  ["13", "Drill Eleven (11) 3/4\"", 1810, 20, 0, 0, 0],
  ["16", "Labor and Materials Need to Demob 650' of 8\"", 1, 8625, 0, 1, 0],
  ["11", "Bonding Surcharge", 1, 4600, 0, 0, 0],
  ["14", "Drill Five (5) 3/4\"", 1400, 35, 0, 0, 0],
  ["17", "Downtime, Mob/Demob, Labor & Materials for Drilling Crew", 1, 61200, 0, 1, 0],
  ["19", "Pre Purchased Materials - 650LF 8\"", 650, 21.1, 0, 650, 0],
];

// ---------- write ----------
for (const p of projects) {
  await client.query(
    `INSERT INTO projects (id, name, location, status, start_date, end_date, duration, value, crew)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET name=$2, location=$3, status=$4, start_date=$5, end_date=$6, duration=$7, value=$8, crew=$9`,
    [p.id, p.name, p.location ?? null, p.status, p.startDate ?? null, p.endDate ?? null, p.duration ?? null, p.value, JSON.stringify(p.crew)]
  );
}
console.log(`Projects: ${projects.length}`);

for (const c of crewMembers) {
  await client.query(`INSERT INTO crew (id, name) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET name=$2`, [c.id, c.name]);
}
console.log(`Crew: ${crewMembers.length}`);

for (const o of opportunities) {
  await client.query(
    `INSERT INTO opportunities (id, kind, opp_type, job_name, estimator, bid_due_date, customer, location, bid_value, bid_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [o.id, o.kind, o.oppType, o.jobName, o.estimator, o.bidDueDate, o.customer, o.location, o.bidValue, o.bidStatus]
  );
}
console.log(`Opportunities: ${opportunities.length}`);

await client.query(
  `INSERT INTO pay_apps (id, project_id, app_number, period, application_date, retainage_percent)
   VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
  [payApp.id, payApp.projectId, payApp.appNumber, payApp.period, payApp.applicationDate, payApp.retainagePercent]
);
console.log("Pay App: 1");

let order = 0;
for (const [itemNo, description, bidQty, unitPrice, baselineQty, periodQty, stored] of sovRows) {
  const sovItemId = randomUUID();
  await client.query(
    `INSERT INTO sov_items (id, project_id, item_no, description, bid_qty, unit_price, baseline_qty, "order")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [sovItemId, payApp.projectId, itemNo, description, bidQty, unitPrice, baselineQty, order++]
  );
  await client.query(
    `INSERT INTO sov_entries (id, project_id, pay_app_id, item_no, period_qty, stored)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [randomUUID(), payApp.projectId, payAppId, itemNo, periodQty, stored]
  );
  // public, price-free catalog for Daily Logs
  const liId = (payApp.projectId + "-" + itemNo).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  await client.query(
    `INSERT INTO line_items (id, project_id, item_no, description, "order")
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET description=$4`,
    [liId, payApp.projectId, itemNo, description, order]
  );
}
console.log(`Schedule of values items: ${sovRows.length}`);

await client.end();
console.log("Migration complete.");
