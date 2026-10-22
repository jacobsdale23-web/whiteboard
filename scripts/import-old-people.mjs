// One-time import of the old AppSheet "People" tab into the HR module.
//   node --env-file=.env.local scripts/import-old-people.mjs <people-parsed.json> [--apply]
// Without --apply it only prints what it would do. Safe to re-run: people
// already present (same name + company) are skipped.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) {
  console.error("Usage: node --env-file=.env.local scripts/import-old-people.mjs <people-parsed.json> [--apply]");
  process.exit(1);
}
const people = JSON.parse(fs.readFileSync(file, "utf8"));

// App-vendor / test accounts and a record the old app itself marks as a duplicate.
const skipReason = (p) => {
  const emails = `${p.personalEmail} ${p.companyEmail}`.toLowerCase();
  if (/sonorus\.co\.uk|fieldapps/.test(emails)) return "app-vendor/test account";
  if (/^dev team$|^admin@fieldapps$/i.test(p.name)) return "app account";
  if (/duplicate/i.test(p.note)) return "marked duplicate in old app";
  if (!p.companyId) return "no company";
  return null;
};

const fmtPhone = (s) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : (s || "").trim() || null;
};
const nz = (s) => (s && s.trim() ? s.trim() : null);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const existingEmp = new Set((await client.query("select lower(name)||'|'||company_id k from hr_employees")).rows.map((r) => r.k));
const existingCand = new Set((await client.query("select lower(name)||'|'||company_id k from hr_candidates")).rows.map((r) => r.k));

const plan = { employees: [], candidates: [], skipped: [], already: [] };
for (const p of people) {
  const why = skipReason(p);
  if (why) {
    plan.skipped.push(`${p.name} (${why})`);
    continue;
  }
  const key = `${p.name.toLowerCase()}|${p.companyId}`;
  const email = nz(p.companyEmail) || nz(p.personalEmail);
  const personal = nz(p.personalEmail) && nz(p.personalEmail) !== email ? nz(p.personalEmail) : null;
  const note = nz(p.note) ? `Old app note: ${p.note.trim()}` : null;
  if (p.status === "Candidate") {
    if (existingCand.has(key)) plan.already.push(p.name);
    else plan.candidates.push({ id: randomUUID(), companyId: p.companyId, name: p.name, phone: fmtPhone(p.phone), email: nz(p.personalEmail) || email, address: nz(p.address), position: nz(p.title), stage: "applied", notes: note });
  } else {
    if (existingEmp.has(key)) plan.already.push(p.name);
    else
      plan.employees.push({
        id: randomUUID(),
        companyId: p.companyId,
        name: p.name,
        position: nz(p.title),
        phone: fmtPhone(p.phone),
        email,
        personalEmail: personal,
        address: nz(p.address),
        status: p.status === "Inactive" ? "terminated" : "active",
        // The old app does not track testing-program enrollment; HR confirms this per person.
        daProgram: p.status === "Inactive" ? "inactive" : "pending",
        notes: note,
      });
  }
}

const byCo = (list) => list.reduce((o, x) => ((o[x.companyId] = (o[x.companyId] || 0) + 1), o), {});
console.log("employees to add:", plan.employees.length, byCo(plan.employees), "| active:", plan.employees.filter((e) => e.status === "active").length, "terminated:", plan.employees.filter((e) => e.status === "terminated").length);
console.log("candidates to add:", plan.candidates.map((c) => c.name));
console.log("skipped:", plan.skipped);
console.log("already present:", plan.already.length);

if (apply) {
  for (const e of plan.employees) {
    await client.query(
      `insert into hr_employees (id, company_id, name, position, phone, email, personal_email, address, status, da_program, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [e.id, e.companyId, e.name, e.position, e.phone, e.email, e.personalEmail, e.address, e.status, e.daProgram, e.notes]
    );
  }
  for (const c of plan.candidates) {
    await client.query(
      `insert into hr_candidates (id, company_id, name, phone, email, address, position, stage, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [c.id, c.companyId, c.name, c.phone, c.email, c.address, c.position, c.stage, c.notes]
    );
  }
  console.log("APPLIED.");
} else {
  console.log("Dry run only. Re-run with --apply to write.");
}
await client.end();
