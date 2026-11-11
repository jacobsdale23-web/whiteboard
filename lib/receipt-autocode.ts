import { and, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, receipts } from "@/lib/db/schema";
import { findJobCustomer } from "@/lib/quickbooks";
import { codePurchaseToJob, getPurchase, listCardAccounts, listCardCharges } from "@/lib/qb-cards";
import { matchReceipts, type ReceiptLite } from "@/lib/receipt-match";

export const CARD_NAME_RE = /capital\s*(one|1)/i;
const ymd = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

// REAL CHANGE IN QUICKBOOKS: puts the receipt's job on its matched card charge. An FWI hot tap's receipts go on the job it
// is billed through. Used by the Receipt match page and by the scheduled run.
export async function codeReceiptToJob(companyId: string, receiptId: string): Promise<{ error?: string; message?: string }> {
  const [row] = await db
    .select({ receipt: receipts, project: projects })
    .from(receipts)
    .innerJoin(projects, eq(projects.id, receipts.projectId))
    .where(and(eq(receipts.id, receiptId), eq(projects.companyId, companyId)));
  if (!row) return { error: "That receipt no longer exists." };
  if (!row.receipt.qbTxnId) return { error: "Match the receipt to a charge first." };
  if (row.receipt.qbCodedAt) return { error: "That charge was already coded to the job." };

  let job = row.project;
  if (job.jobKind === "fwi_hot_tap" && job.billedThroughProjectId) {
    const [parent] = await db.select().from(projects).where(and(eq(projects.id, job.billedThroughProjectId), eq(projects.companyId, companyId)));
    if (parent) job = parent;
  }
  if (!job.projectNumber) return { error: `${job.name} has no QuickBooks number yet, so there is no job to code the charge to.` };

  const customer = await findJobCustomer(companyId, job.projectNumber, null);
  if (typeof customer === "string") return { error: customer };

  const purchase = await getPurchase(companyId, row.receipt.qbTxnId);
  if (!purchase) return { error: "QuickBooks no longer has that charge." };
  const problem = await codePurchaseToJob(companyId, purchase, customer.Id, customer.DisplayName);
  if (problem) return { error: problem };

  await db.update(receipts).set({ qbCodedAt: new Date() }).where(eq(receipts.id, receiptId));
  return { message: `Coded the ${row.receipt.vendor || "charge"} charge to ${customer.DisplayName} in QuickBooks.` };
}

export type RunSummary = { cards: string[]; charges: number; receiptsConsidered: number; newlyMatched: number; coded: number; codeErrors: string[]; autoCodeOn: boolean };

// The scheduled pass (and the page's "Run now"): for each Capital One card account, match new charges to receipts the
// foremen scanned. Only unambiguous pairs are matched on their own (that part never touches QuickBooks). When autoCode is
// on, every matched-but-uncoded receipt is then coded to its job in QuickBooks.
export async function runReceiptMatch(companyId: string, opts: { autoCode: boolean; days?: number }): Promise<RunSummary> {
  const days = opts.days ?? 45;
  const summary: RunSummary = { cards: [], charges: 0, receiptsConsidered: 0, newlyMatched: 0, coded: 0, codeErrors: [], autoCodeOn: opts.autoCode };
  const accounts = (await listCardAccounts(companyId)).filter((a) => CARD_NAME_RE.test(a.name));
  summary.cards = accounts.map((a) => a.name);
  if (!accounts.length) return summary;

  const rows = await db
    .select({ r: receipts, p: projects })
    .from(receipts)
    .innerJoin(projects, eq(projects.id, receipts.projectId))
    .where(and(eq(projects.companyId, companyId), gte(receipts.date, ymd(days + 5))));
  const lite: ReceiptLite[] = rows.map(({ r, p }) => ({ id: r.id, date: r.date, amount: Number(r.amount), vendor: r.vendor, projectId: p.id, projectName: p.name, submittedBy: r.submittedBy, qbTxnId: r.qbTxnId }));
  summary.receiptsConsidered = lite.length;

  // Charges from every Capital One card together, so a receipt can match whichever card was used.
  const charges = [];
  for (const a of accounts) charges.push(...(await listCardCharges(companyId, a.id, ymd(days))).charges);
  summary.charges = charges.length;

  const { suggestions } = matchReceipts(lite, charges);
  for (const s of suggestions) {
    if (!s.auto) continue;
    const res = await db.update(receipts).set({ qbTxnId: s.charge.id, qbMatchedAt: new Date(), qbMatchedBy: "auto" }).where(and(eq(receipts.id, s.receipt.id), isNull(receipts.qbTxnId))).returning({ id: receipts.id });
    if (res.length) summary.newlyMatched++;
  }

  if (opts.autoCode) {
    const ready = await db
      .select({ id: receipts.id })
      .from(receipts)
      .innerJoin(projects, eq(projects.id, receipts.projectId))
      .where(and(eq(projects.companyId, companyId), isNotNull(receipts.qbTxnId), isNull(receipts.qbCodedAt)));
    for (const { id } of ready) {
      try {
        const res = await codeReceiptToJob(companyId, id);
        if (res.error) summary.codeErrors.push(res.error);
        else summary.coded++;
      } catch (e) {
        summary.codeErrors.push(e instanceof Error ? e.message : "Couldn't code a charge.");
      }
    }
  }
  return summary;
}
