"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { cardLineJobs, cardVendorRules, projects, receipts } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireCompany } from "@/lib/auth/company";
import { parseCardCsv, patternMatches, statementCharges, vendorPattern } from "@/lib/card-statement";
import { matchReceipts, type ReceiptLite } from "@/lib/receipt-match";

// Matching a Capital One export to receipts changes only White Board (receipts.qb_txn_id holds the statement line's key).
// Nothing is sent to QuickBooks.

async function requireFwiAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") throw new Error("Only admins can do this.");
  const company = await requireCompany();
  if (company.id !== "fwi") throw new Error("This works for Feliciana Welders only for now.");
  return { companyId: company.id, name: current.profile.name };
}

export type LineSource = "receipt" | "manual" | "rule";
export type StatementLineOut = { key: string; date: string; description: string; card: string; amount: number; credit: boolean; job: string | null; source: LineSource | null; receipt: string | null; ruleLabel: string | null };
export type StatementResult = {
  error?: string;
  problems: string[];
  lineCount: number;
  autoMatchedNow: number;
  cards: string[];
  lines: StatementLineOut[];
  review: { receiptId: string; key: string; note: string; receipt: { vendor: string | null; amount: number; date: string | null; project: string; by: string }; line: { date: string; description: string; amount: number } }[];
  receiptsWithoutCharge: { id: string; vendor: string | null; amount: number; date: string | null; project: string; by: string }[];
  jobOptions: { id: string; label: string }[];
  rules: { id: string; label: string; job: string }[];
};

const empty = (error: string): StatementResult => ({ error, problems: [], lineCount: 0, autoMatchedNow: 0, cards: [], lines: [], review: [], receiptsWithoutCharge: [], jobOptions: [], rules: [] });
const dayShift = (iso: string, d: number) => new Date(Date.parse(iso + "T00:00:00Z") + d * 86400000).toISOString().slice(0, 10);

export async function analyzeStatement(csvText: string): Promise<StatementResult> {
  try {
    const { companyId } = await requireFwiAdmin();
    if (csvText.length > 3_000_000) return empty("That file is too large for a statement export.");
    const parsed = parseCardCsv(csvText);
    if (!parsed.lines.length) return { ...empty(parsed.problems[0] || "No transactions found."), problems: parsed.problems };

    const dates = parsed.lines.map((l) => l.date).sort();
    const from = dayShift(dates[0], -10);
    const to = dayShift(dates[dates.length - 1], 3);
    const keys = new Set(parsed.lines.map((l) => l.key));

    const allProjects = await db.select().from(projects).where(eq(projects.companyId, companyId));
    const projectById = new Map(allProjects.map((p) => [p.id, p]));
    const label = (p: (typeof allProjects)[number]) => (p.projectNumber ? `${p.projectNumber} · ${p.name}` : p.name);
    // A job's costs roll up to its own number; an FWI hot tap's go on the job it is billed through.
    const jobOf = (projectId: string) => {
      let p = projectById.get(projectId);
      if (p?.jobKind === "fwi_hot_tap" && p.billedThroughProjectId) p = projectById.get(p.billedThroughProjectId) ?? p;
      return p ? label(p) : "Unknown job";
    };

    const rows = await db
      .select({ r: receipts, p: projects })
      .from(receipts)
      .innerJoin(projects, eq(projects.id, receipts.projectId))
      .where(and(eq(projects.companyId, companyId), gte(receipts.date, from), lte(receipts.date, to)));
    const lite: ReceiptLite[] = rows.map(({ r, p }) => ({ id: r.id, date: r.date, amount: Number(r.amount), vendor: r.vendor, projectId: p.id, projectName: label(p), submittedBy: r.submittedBy, qbTxnId: r.qbTxnId }));
    const result = matchReceipts(lite, statementCharges(parsed.lines));

    // Clear pairs are matched on their own (White Board only).
    let autoMatchedNow = 0;
    const autoAssigned = new Map<string, string>(); // line key -> receipt id
    for (const s of result.suggestions) {
      if (!s.auto) continue;
      const res = await db.update(receipts).set({ qbTxnId: s.charge.id, qbMatchedAt: new Date(), qbMatchedBy: "auto" }).where(and(eq(receipts.id, s.receipt.id), isNull(receipts.qbTxnId))).returning({ id: receipts.id });
      if (res.length) {
        autoMatchedNow++;
        autoAssigned.set(s.charge.id, s.receipt.id);
      }
    }

    const byKey = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (row.r.qbTxnId && keys.has(row.r.qbTxnId)) byKey.set(row.r.qbTxnId, row);
    for (const [key, rid] of autoAssigned) {
      const row = rows.find((x) => x.r.id === rid);
      if (row) byKey.set(key, row);
    }

    // Charges with no receipt: assigned by hand, or by a remembered vendor.
    const manual = new Map((await db.select().from(cardLineJobs).where(and(eq(cardLineJobs.companyId, companyId), inArray(cardLineJobs.key, [...keys])))).map((m) => [m.key, m]));
    const rules = await db.select().from(cardVendorRules).where(eq(cardVendorRules.companyId, companyId));

    const lines: StatementLineOut[] = parsed.lines.map((l) => {
      const row = byKey.get(l.key);
      if (row) return { ...pick(l), job: jobOf(row.p.id), source: "receipt", receipt: `${row.r.vendor || "Receipt"} · ${row.r.submittedBy}`, ruleLabel: null };
      if (l.credit) return { ...pick(l), job: null, source: null, receipt: null, ruleLabel: null };
      const m = manual.get(l.key);
      if (m) return { ...pick(l), job: jobOf(m.projectId), source: "manual", receipt: null, ruleLabel: null };
      const rule = rules.find((r) => patternMatches(r.pattern, l.description));
      if (rule) return { ...pick(l), job: jobOf(rule.projectId), source: "rule", receipt: null, ruleLabel: rule.label };
      return { ...pick(l), job: null, source: null, receipt: null, ruleLabel: null };
    });

    const reviewKeys = new Set(autoAssigned.keys());
    const review = result.suggestions
      .filter((s) => !s.auto && !reviewKeys.has(s.charge.id))
      .map((s) => ({ receiptId: s.receipt.id, key: s.charge.id, note: s.note, receipt: { vendor: s.receipt.vendor, amount: s.receipt.amount, date: s.receipt.date, project: s.receipt.projectName, by: s.receipt.submittedBy }, line: { date: s.charge.date, description: s.charge.vendor, amount: s.charge.amount } }));

    const matchedReceiptIds = new Set([...byKey.values()].map((r) => r.r.id));
    const reviewReceiptIds = new Set(review.map((r) => r.receiptId));
    const receiptsWithoutCharge = lite
      .filter((r) => !r.qbTxnId && !matchedReceiptIds.has(r.id) && !reviewReceiptIds.has(r.id))
      .map((r) => ({ id: r.id, vendor: r.vendor, amount: r.amount, date: r.date, project: r.projectName, by: r.submittedBy }));

    const jobOptions = allProjects
      .filter((p) => p.status !== "canceled" && p.jobKind !== "fwi_hot_tap")
      .map((p) => ({ id: p.id, label: label(p) }))
      .sort((a, b) => b.label.localeCompare(a.label, undefined, { numeric: true }));

    return {
      problems: parsed.problems,
      lineCount: parsed.lines.length,
      autoMatchedNow,
      cards: [...new Set(parsed.lines.map((l) => l.card).filter(Boolean))].sort(),
      lines,
      review,
      receiptsWithoutCharge,
      jobOptions,
      rules: rules.map((r) => ({ id: r.id, label: r.label, job: projectById.get(r.projectId) ? label(projectById.get(r.projectId)!) : "Unknown job" })),
    };
  } catch (e) {
    return empty(e instanceof Error ? e.message : "Couldn't read that file.");
  }
}

const pick = (l: { key: string; date: string; description: string; card: string; amount: number; credit: boolean }) => ({ key: l.key, date: l.date, description: l.description, card: l.card, amount: l.amount, credit: l.credit });

// A person confirms a less-certain pair from the statement.
export async function confirmStatementMatch(receiptId: string, key: string): Promise<{ error?: string }> {
  try {
    const { companyId, name } = await requireFwiAdmin();
    if (!/^csv:[0-9a-f]{16}$/.test(key)) return { error: "That isn't a statement line." };
    const [row] = await db.select({ r: receipts }).from(receipts).innerJoin(projects, eq(projects.id, receipts.projectId)).where(and(eq(receipts.id, receiptId), eq(projects.companyId, companyId)));
    if (!row) return { error: "That receipt no longer exists." };
    if (row.r.qbTxnId) return { error: "That receipt is already matched." };
    const [taken] = await db.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.qbTxnId, key), ne(receipts.id, receiptId)));
    if (taken) return { error: "That statement line is already matched to another receipt." };
    await db.update(receipts).set({ qbTxnId: key, qbMatchedAt: new Date(), qbMatchedBy: name }).where(eq(receipts.id, receiptId));
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't match that receipt." };
  }
}

// Puts a charge that has no receipt on a job by hand, optionally remembering the vendor for next time.
export async function assignCharge(line: { key: string; date: string; description: string; amount: number; card: string }, projectId: string, remember: boolean): Promise<{ error?: string }> {
  try {
    const { companyId, name } = await requireFwiAdmin();
    if (!/^csv:[0-9a-f]{16}$/.test(line.key)) return { error: "That isn't a statement line." };
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)));
    if (!project) return { error: "Pick a job from the list." };
    await db
      .insert(cardLineJobs)
      .values({ key: line.key, companyId, projectId, date: line.date, description: line.description.slice(0, 200), amount: String(line.amount), card: line.card, setBy: name })
      .onConflictDoUpdate({ target: cardLineJobs.key, set: { projectId, setBy: name, setAt: new Date() } });
    if (remember) {
      const pattern = vendorPattern(line.description);
      if (!pattern) return { error: "Assigned, but I couldn't make a vendor name to remember from that description." };
      await db
        .insert(cardVendorRules)
        .values({ id: randomUUID(), companyId, pattern, label: pattern, projectId, createdBy: name })
        .onConflictDoUpdate({ target: [cardVendorRules.companyId, cardVendorRules.pattern], set: { projectId, createdBy: name } });
    }
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't assign that charge." };
  }
}

export async function clearChargeAssignment(key: string): Promise<{ error?: string }> {
  try {
    const { companyId } = await requireFwiAdmin();
    await db.delete(cardLineJobs).where(and(eq(cardLineJobs.key, key), eq(cardLineJobs.companyId, companyId)));
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't clear that." };
  }
}

export async function removeVendorRule(id: string): Promise<{ error?: string }> {
  try {
    const { companyId } = await requireFwiAdmin();
    await db.delete(cardVendorRules).where(and(eq(cardVendorRules.id, id), eq(cardVendorRules.companyId, companyId)));
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't remove that." };
  }
}
