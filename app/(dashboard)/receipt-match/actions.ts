"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, receipts } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireCompany } from "@/lib/auth/company";
import { getConnection, qbConfig, QbError } from "@/lib/quickbooks";
import { getPurchase } from "@/lib/qb-cards";
import { codeReceiptToJob, runReceiptMatch } from "@/lib/receipt-autocode";

export type MatchResultMsg = { error?: string; message?: string };

// Admin-only, Feliciana-only for now.
async function requireFwiAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") throw new Error("Only admins can do this.");
  const company = await requireCompany();
  if (company.id !== "fwi") throw new Error("This works for Feliciana Welders only for now.");
  if (!qbConfig().configured || !(await getConnection(company.id))) throw new Error("QuickBooks isn't connected for this company.");
  return { companyId: company.id, name: current.profile.name };
}

async function ownReceipt(companyId: string, receiptId: string) {
  const [row] = await db
    .select({ receipt: receipts, project: projects })
    .from(receipts)
    .innerJoin(projects, eq(projects.id, receipts.projectId))
    .where(and(eq(receipts.id, receiptId), eq(projects.companyId, companyId)));
  return row ?? null;
}

// Records that this receipt is this card charge. Changes nothing in QuickBooks.
export async function confirmMatch(receiptId: string, txnId: string): Promise<MatchResultMsg> {
  try {
    const { companyId, name } = await requireFwiAdmin();
    const row = await ownReceipt(companyId, receiptId);
    if (!row) return { error: "That receipt no longer exists." };
    if (row.receipt.qbTxnId) return { error: "That receipt is already matched." };
    const [taken] = await db.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.qbTxnId, txnId), ne(receipts.id, receiptId)));
    if (taken) return { error: "That charge is already matched to another receipt." };
    const purchase = await getPurchase(companyId, txnId);
    if (!purchase) return { error: "QuickBooks no longer has that charge." };
    await db.update(receipts).set({ qbTxnId: txnId, qbMatchedAt: new Date(), qbMatchedBy: name }).where(eq(receipts.id, receiptId));
    revalidatePath("/receipt-match");
    return { message: "Matched." };
  } catch (e) {
    if (e instanceof QbError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Couldn't match that receipt." };
  }
}

export async function confirmMany(pairs: { receiptId: string; txnId: string }[]): Promise<MatchResultMsg> {
  let ok = 0;
  const problems: string[] = [];
  for (const p of pairs) {
    const res = await confirmMatch(p.receiptId, p.txnId);
    if (res.error) problems.push(res.error);
    else ok++;
  }
  return problems.length ? { error: `Matched ${ok}; ${problems.length} could not be matched (${[...new Set(problems)].join("; ")}).` } : { message: `Matched ${ok} receipts.` };
}

export async function unmatchReceipt(receiptId: string): Promise<MatchResultMsg> {
  try {
    const { companyId } = await requireFwiAdmin();
    const row = await ownReceipt(companyId, receiptId);
    if (!row) return { error: "That receipt no longer exists." };
    if (row.receipt.qbCodedAt) return { error: "That charge was already coded to the job in QuickBooks; change it there." };
    await db.update(receipts).set({ qbTxnId: null, qbMatchedAt: null, qbMatchedBy: null }).where(eq(receipts.id, receiptId));
    revalidatePath("/receipt-match");
    return { message: "Match removed." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't remove that match." };
  }
}

// REAL CHANGE IN QUICKBOOKS: puts the receipt's job on the matched card charge so the cost lands on the job.
export async function codeChargeToJob(receiptId: string): Promise<MatchResultMsg> {
  try {
    const { companyId } = await requireFwiAdmin();
    const res = await codeReceiptToJob(companyId, receiptId);
    revalidatePath("/receipt-match");
    return res;
  } catch (e) {
    if (e instanceof QbError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Couldn't code that charge." };
  }
}

// REAL CHANGE IN QUICKBOOKS: codes every matched, not-yet-coded receipt's charge to its job (one at a time, stopping nowhere:
// problems are listed).
export async function codeAllReady(): Promise<MatchResultMsg> {
  try {
    const { companyId } = await requireFwiAdmin();
    const ready = await db
      .select({ id: receipts.id })
      .from(receipts)
      .innerJoin(projects, eq(projects.id, receipts.projectId))
      .where(and(eq(projects.companyId, companyId), isNotNull(receipts.qbTxnId), isNull(receipts.qbCodedAt)));
    let ok = 0;
    const problems: string[] = [];
    for (const { id } of ready) {
      const res = await codeReceiptToJob(companyId, id);
      if (res.error) problems.push(res.error);
      else ok++;
    }
    revalidatePath("/receipt-match");
    return problems.length ? { error: `Coded ${ok}; ${problems.length} could not be coded: ${[...new Set(problems)].join("; ")}` } : { message: `Coded ${ok} charges to their jobs in QuickBooks.` };
  } catch (e) {
    if (e instanceof QbError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Couldn't code the charges." };
  }
}

// Runs the same pass as the daily schedule right now. Coding in QuickBooks only happens if automatic coding is switched on.
export async function runMatchNow(): Promise<MatchResultMsg> {
  try {
    const { companyId } = await requireFwiAdmin();
    const s = await runReceiptMatch(companyId, { autoCode: process.env.RECEIPT_AUTOCODE === "1" });
    revalidatePath("/receipt-match");
    return { message: `Looked at ${s.charges} charges and ${s.receiptsConsidered} receipts: ${s.newlyMatched} newly matched${s.autoCodeOn ? `, ${s.coded} coded to jobs${s.codeErrors.length ? `, ${s.codeErrors.length} couldn't be coded` : ""}` : " (automatic coding is off)"}.` };
  } catch (e) {
    if (e instanceof QbError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Couldn't run the match." };
  }
}
