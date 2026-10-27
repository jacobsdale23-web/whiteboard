// Read-only: compares QuickBooks project numbers with White Board projects.
// Input file: one line per QuickBooks project, "number|name|customer[|startDate]".
// Run: node --env-file=.env.local scripts/compare-qb-projects.mjs <file> [yearPrefix]
// yearPrefix is the two-digit year to report on (default: current year, e.g. 26).
import fs from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) throw new Error("Pass the QuickBooks project file as the first argument.");
const yy = process.argv[3] || String(new Date().getFullYear()).slice(2);

const qb = fs
  .readFileSync(file, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .map((l) => {
    const [num, name, customer, start] = l.split("|").map((s) => s.trim());
    return { num, name, customer: customer || "", start: start || "" };
  })
  .filter((q) => q.num.startsWith(yy));

const norm = (s) => (s || "").toLowerCase().replace(/[“”"”’'.,()#@&\-–]/g, " ").replace(/\s+/g, " ").trim();
const STOP = new Set(["the", "of", "and", "at", "st", "dr", "rd", "ln", "la", "in", "for", "a"]);
const toks = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
const overlap = (a, b) => {
  const A = toks(a), B = toks(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
};
// Internal QuickBooks jobs that are not field projects.
const INTERNAL = (q) => /000$/.test(q.num) || /^\d{2}[A-Za-z]+$/.test(q.num);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const wb = (await client.query("select id, company_id, name, project_number, status, customer, start_date from projects")).rows;
await client.end();

const byNum = new Map();
for (const p of wb) if (p.project_number) byNum.set(p.project_number.trim(), [...(byNum.get(p.project_number.trim()) || []), p]);

const missing = qb.filter((q) => !INTERNAL(q) && !byNum.has(q.num));
const mismatched = qb.filter((q) => {
  const hits = byNum.get(q.num);
  return hits && Math.max(...hits.map((h) => overlap(q.name, h.name))) < 0.34;
});
const qbNums = new Set(qb.map((q) => q.num));
const wbOnly = wb.filter((p) => p.project_number && p.project_number.startsWith(yy) && !qbNums.has(p.project_number.trim()));
const unnumbered = wb.filter((p) => !p.project_number && (p.status === "active" || p.status === "upcoming"));

console.log(`QuickBooks ${yy}xxx projects read: ${qb.length}. White Board projects: ${wb.length}.\n`);

console.log(`1) In QuickBooks but no White Board project has that number: ${missing.length}`);
for (const q of missing) {
  const maybe = wb
    .filter((p) => !p.project_number)
    .map((p) => ({ p, s: overlap(q.name, p.name) + overlap(q.customer, p.customer) * 0.5 }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)[0];
  console.log(`   ${q.num} | ${q.name} | ${q.customer}${q.start ? ` | start ${q.start}` : ""}${maybe ? `\n        possible existing job without a number: "${maybe.p.name}" [${maybe.p.status}]` : ""}`);
}

console.log(`\n2) Same number, but the names look different: ${mismatched.length}`);
for (const q of mismatched) console.log(`   ${q.num} QuickBooks "${q.name}" vs White Board ${byNum.get(q.num).map((h) => `"${h.name}"`).join(", ")}`);

console.log(`\n3) White Board numbers that QuickBooks doesn't have: ${wbOnly.length}`);
for (const p of wbOnly) console.log(`   ${p.project_number} | ${p.name} [${p.company_id}/${p.status}]`);

console.log(`\n4) Active or upcoming White Board jobs with no number: ${unnumbered.length}`);
for (const p of unnumbered) console.log(`   ${p.name} [${p.status}]${p.customer ? ` | ${p.customer}` : ""}${p.start_date ? ` | starts ${p.start_date}` : ""}`);
