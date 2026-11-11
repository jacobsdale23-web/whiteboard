"use server";

import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, receipts } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireCompany } from "@/lib/auth/company";
import { parseCardCsv, statementCharges } from "@/lib/card-statement";
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

export type StatementResult = {
  error?: string;
  problems: string[];
  lineCount: number;
  chargeTotal: number;
  creditTotal: number;
  autoMatchedNow: number;
  split: { job: string; count: number; total: number }[];
  unmatchedTotal: number;
  lines: { key: string; date: string; description: string; card: string; amount: number; credit: boolean; job: string | null; receipt: string | null; receiptId: string | null }[];
  review: { receiptId: string; key: string; note: string; receipt: { vendor: string | null; amount: number; date: string | null; project: string; by: string }; line: { date: string; description: string; amount: number } }[];
  receiptsWithoutCharge: { id: string; vendor: string | null; amount: number; date: string | null; project: string; by: string }[];
};

const empty = (error: string): StatementResult => ({ error, problems: [], lineCount: 0, chargeTotal: 0, creditTotal: 0, autoMatchedNow: 0, split: [], unmatchedTotal: 0, lines: [], review: [], receiptsWithoutCharge: [] });
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
    const jobOf = (projectId: string) => {
      let p = projectById.get(projectId);
      if (p?.jobKind === "fwi_hot_tap" && p.billedThroughProjectId) p = projectById.get(p.billedThroughProjectId) ?? p;
      return p ? (p.projectNumber ? `${p.projectNumber} · ${p.name}` : p.name) : "Unknown job";
    };

    const rows = await db
      .select({ r: receipts, p: projects })
      .from(receipts)
      .innerJoin(projects, eq(projects.id, receipts.projectId))
      .where(and(eq(projects.companyId, companyId), gte(receipts.date, from), lte(receipts.date, to)));
    const lite: ReceiptLite[] = rows.map(({ r, p }) => ({ id: r.id, date: r.date, amount: Number(r.amount), vendor: r.vendor, projectId: p.id, projectName: p.projectNumber ? `${p.projectNumber} · ${p.name}` : p.name, submittedBy: r.submittedBy, qbTxnId: r.qbTxnId }));
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

    // Every statement line's final receipt: matched earlier (key stored on the receipt) or just now.
    const byKey = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (row.r.qbTxnId && keys.has(row.r.qbTxnId)) byKey.set(row.r.qbTxnId, row);
    for (const [key, rid] of autoAssigned) {
      const row = rows.find((x) => x.r.id === rid);
      if (row) byKey.set(key, row);
    }

    const lines = parsed.lines.map((l) => {
      const row = byKey.get(l.key);
      return { key: l.key, date: l.date, description: l.description, card: l.card, amount: l.amount, credit: l.credit, job: row ? jobOf(row.p.id) : null, receipt: row ? `${row.r.vendor || "Receipt"} · ${row.r.submittedBy}` : null, receiptId: row?.r.id ?? null };
    });

    const splitMap = new Map<string, { count: number; total: number }>();
    let unmatchedTotal = 0;
    for (const l of lines) {
      if (l.credit) continue;
      if (!l.job) {
        unmatchedTotal += l.amount;
        continue;
      }
      const cur = splitMap.get(l.job) ?? { count: 0, total: 0 };
      cur.count++;
      cur.total += l.amount;
      splitMap.set(l.job, cur);
    }
    const split = [...splitMap.entries()].map(([job, v]) => ({ job, count: v.count, total: Math.round(v.total * 100) / 100 })).sort((a, b) => a.job.localeCompare(b.job, undefined, { numeric: true }));

    const reviewKeys = new Set(autoAssigned.keys());
    const review = result.suggestions
      .filter((s) => !s.auto && !reviewKeys.has(s.charge.id))
      .map((s) => ({ receiptId: s.receipt.id, key: s.charge.id, note: s.note, receipt: { vendor: s.receipt.vendor, amount: s.receipt.amount, date: s.receipt.date, project: s.receipt.projectName, by: s.receipt.submittedBy }, line: { date: s.charge.date, description: s.charge.vendor, amount: s.charge.amount } }));

    const matchedReceiptIds = new Set([...byKey.values()].map((r) => r.r.id));
    const reviewReceiptIds = new Set(review.map((r) => r.receiptId));
    const receiptsWithoutCharge = lite
      .filter((r) => !r.qbTxnId && !matchedReceiptIds.has(r.id) && !reviewReceiptIds.has(r.id))
      .map((r) => ({ id: r.id, vendor: r.vendor, amount: r.amount, date: r.date, project: r.projectName, by: r.submittedBy }));

    return {
      problems: parsed.problems,
      lineCount: parsed.lines.length,
      chargeTotal: Math.round(parsed.lines.filter((l) => !l.credit).reduce((s, l) => s + l.amount, 0) * 100) / 100,
      creditTotal: Math.round(parsed.lines.filter((l) => l.credit).reduce((s, l) => s + l.amount, 0) * 100) / 100,
      autoMatchedNow,
      split,
      unmatchedTotal: Math.round(unmatchedTotal * 100) / 100,
      lines,
      review,
      receiptsWithoutCharge,
    };
  } catch (e) {
    return empty(e instanceof Error ? e.message : "Couldn't read that file.");
  }
}

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
