// Attaches QuickBooks estimates (quotes) to the White Board jobs they belong to, for the twice-weekly QuickBooks check.
// Feliciana only (the Intuit connector reads Feliciana's QuickBooks).
//
// Input: the JSON from the connector's qbo_sales_get_estimates (an object with a `data` array, or the array itself).
// A quote is attached only when the match is certain: the estimate's customer is a QuickBooks job named "NNNNN - ..."
// and White Board has that job number. A customer-name match alone is never attached (it can pair a quote with the
// wrong job); recent ones with at most three candidate jobs are listed as suggestions for a person to confirm.
// Estimates already attached are never touched except to refresh their QuickBooks status; a changed total is
// reported, not overwritten.
//
// Run: node --env-file=.env.local scripts/attach-qb-quotes.mjs <estimates.json> [--pdf-dir <dir>] [--dry] [--days 120]
// With --pdf-dir, a file named <estimate number>.pdf there is stored as the quote's PDF.
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import pg from "pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const file = args[0]; // the estimates JSON comes first
const flag = (name) => args.includes(name);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const dry = flag("--dry");
const pdfDir = opt("--pdf-dir", null);
const days = Number(opt("--days", 120));
const COMPANY = "fwi";

const raw = JSON.parse(readFileSync(file, "utf8"));
const estimates = (Array.isArray(raw) ? raw : raw.data || []).map((e) => ({
  id: e.id,
  number: String(e.reference_number ?? "").trim(),
  date: e.txn_date || null,
  total: Number(e.amount) || 0,
  expires: e.expiration_date || null,
  status: e.accept_status?.status || "Pending",
  customer: e.contact?.display_name || "",
  link: e.link || null,
  lines: (e.lines || []).filter((l) => l.description || l.amount).map((l) => ({ description: String(l.description || l.item_name || "").trim(), qty: Number(l.quantity) || 1, amount: Number(l.amount) || 0 })),
}));
if (!estimates.length) {
  console.log("No estimates in the input; nothing to do.");
  process.exit(0);
}

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(llc|inc|co|corp|corporation|company|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const projects = (
  await client.query(
    `select p.id, p.project_number, p.name, p.customer, p.status, p.billing_type,
            (select count(*) from sov_items s where s.project_id = p.id)::int sov,
            (select count(*) from pay_apps a where a.project_id = p.id)::int apps
       from projects p where p.company_id = $1`,
    [COMPANY]
  )
).rows;
const quotes = (await client.query("select q.id, q.project_id, q.number, q.total, q.status from project_quotes q join projects p on p.id = q.project_id where p.company_id = $1", [COMPANY])).rows;
const attachedByNumber = new Map(quotes.map((q) => [q.number, q]));
const hasQuote = new Set(quotes.map((q) => q.project_id));

const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const recent = estimates.filter((e) => e.number && e.date && e.date >= cutoff);

// Small, still-open jobs billed from a quote: not T&M, no schedule of values or pay apps, not canceled/billed.
const eligible = projects.filter((p) => p.billing_type !== "tm" && !p.sov && !p.apps && !["canceled", "billed"].includes(p.status));

const suggestCutoff = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
const plan = { attach: [], ambiguous: [], refresh: [], changed: [], skipped: 0 };

// Already attached: keep QuickBooks' status current, report a changed total.
for (const e of estimates) {
  const have = attachedByNumber.get(e.number);
  if (!have) continue;
  if (have.status !== e.status) plan.refresh.push({ quoteId: have.id, number: e.number, from: have.status, to: e.status });
  if (Math.abs(Number(have.total) - e.total) > 0.005) plan.changed.push({ number: e.number, was: Number(have.total), now: e.total });
}

const open = recent.filter((e) => !attachedByNumber.has(e.number));
const byCustomer = new Map();
for (const e of open) {
  const key = norm(e.customer);
  byCustomer.set(key, [...(byCustomer.get(key) || []), e]);
}

for (const e of open) {
  // 1. QuickBooks job as the customer: "26090 - Good Day Meter Loop"
  const m = e.customer.match(/^\s*(\d{2}[0-9A-Za-z]{3,})\s*-\s*/);
  if (m) {
    const p = projects.find((x) => x.project_number === m[1]);
    if (p && p.billing_type !== "tm") plan.attach.push({ e, p, why: `customer is QuickBooks job ${m[1]}` });
    continue; // a numbered job White Board doesn't have is reported by the project comparison, not here
  }
  // 2. Same customer only: NOT safe to attach by itself (a customer's quotes and jobs rarely pair up one to one, and a
  //    guess would put the wrong scope on a job). Suggest it when the candidates are few and the quote is recent.
  const key = norm(e.customer);
  const jobs = eligible.filter((p) => norm(p.customer) === key && !hasQuote.has(p.id));
  if (!jobs.length) continue; // no White Board job for this customer (a quote not won yet)
  if (e.date >= suggestCutoff && jobs.length <= 3) plan.ambiguous.push({ e, jobs });
  else plan.skipped++;
}

// Two quotes must not land on the same job in one run.
const seen = new Set();
for (const a of plan.attach.slice()) {
  if (seen.has(a.p.id)) {
    plan.attach.splice(plan.attach.indexOf(a), 1);
    plan.ambiguous.push({ e: a.e, jobs: [a.p] });
  }
  seen.add(a.p.id);
}

const money = (n) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
console.log(`Estimates read: ${estimates.length}; in the last ${days} days and not attached: ${open.length}; already attached: ${quotes.length}`);

let s3 = null;
if (!dry && pdfDir) s3 = new S3Client({ endpoint: process.env.AWS_ENDPOINT_URL_S3, region: process.env.AWS_REGION, forcePathStyle: true });

for (const { e, p, why } of plan.attach) {
  const pdfPath = pdfDir ? join(pdfDir, `${e.number}.pdf`) : null;
  const hasPdf = !!pdfPath && existsSync(pdfPath);
  console.log(`${dry ? "WOULD ATTACH" : "ATTACHED"}: quote #${e.number} ${money(e.total)} (${e.customer}, ${e.date}) -> ${p.project_number || "no number"} ${p.name} [${why}]${hasPdf ? " +PDF" : pdfDir ? " (no PDF file)" : ""} estimateId=${e.id}`);
  if (dry) continue;
  let fileId = null;
  if (hasPdf && s3) {
    const body = readFileSync(pdfPath);
    fileId = randomUUID();
    const filename = `Estimate_${e.number}_${e.customer.replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40)}.pdf`;
    const key = `projects/${p.id}/${fileId}-${filename}`;
    await s3.send(new PutObjectCommand({ Bucket: "bid-documents", Key: key, Body: body, ContentType: "application/pdf" }));
    await client.query("insert into project_files (id, project_id, kind, filename, storage_key, file_size) values ($1,$2,'Quote',$3,$4,$5)", [fileId, p.id, filename, key, body.length]);
  }
  await client.query(
    "insert into project_quotes (id, project_id, number, quote_date, customer, total, status, expires, qb_link, lines, file_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [randomUUID(), p.id, e.number, e.date, e.customer, e.total, e.status, e.expires, e.link, JSON.stringify(e.lines), fileId]
  );
}

for (const a of plan.ambiguous) {
  const scope = (a.e.lines[0]?.description || "").slice(0, 110);
  console.log(`SUGGESTION (not attached): quote #${a.e.number} ${money(a.e.total)} (${a.e.customer}, ${a.e.date}) "${scope}" may belong to: ${a.jobs.map((j) => `${j.project_number || "no number"} ${j.name}`).join("; ")} estimateId=${a.e.id}`);
}
if (plan.skipped) console.log(`Not listed: ${plan.skipped} other recent quote(s) for customers with several open jobs or older than 45 days (no safe match).`);
for (const r of plan.refresh) {
  console.log(`${dry ? "WOULD UPDATE" : "UPDATED"} status of quote #${r.number}: ${r.from} -> ${r.to}`);
  if (!dry) await client.query("update project_quotes set status = $1 where id = $2", [r.to, r.quoteId]);
}
for (const c of plan.changed) console.log(`TOTAL CHANGED in QuickBooks: quote #${c.number} was ${money(c.was)} now ${money(c.now)} (White Board not changed)`);
if (!plan.attach.length && !plan.ambiguous.length && !plan.refresh.length && !plan.changed.length) console.log("No new quotes to attach; attached quotes are current.");
await client.end();
