"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, dailyLogs, lineItems, projects, projectFiles, projectQuotes } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireProject } from "@/lib/auth/company";
import { getObjectBuffer } from "@/lib/storage/s3";
import { scanQuotePdf } from "@/lib/quote-scan";
import { cleanQbLink, cleanQuoteFields, cleanQuoteLines } from "@/lib/quotes";
import { findJobCustomer, getConnection, qbApi, qbAttach, qbConfig, qbQuery, qbQuote, QbError } from "@/lib/quickbooks";
import { qbInvoiceLink } from "@/lib/qb-invoice";
import { buildDailyLogsPdf } from "@/lib/daily-log-pdf";

// Quotes carry prices: admin-only, like the Budget they sit beside.
async function requireQuoteAdmin(projectId: string) {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") throw new Error("Only admins can manage quotes.");
  const project = await requireProject(projectId);
  return { project, name: current.profile.name };
}

export type QuoteInput = {
  number: string;
  quoteDate: string;
  customer: string;
  total: string | number;
  expires: string;
  qbLink: string;
  lines: { description: string; qty: string | number; amount: string | number }[];
  fileId: string | null;
};

export type ScanResult = { error?: string; number?: string; quoteDate?: string; expires?: string; customer?: string; total?: number; lines?: { description: string; qty: number; amount: number }[] };

// Reads the quote PDF that was just uploaded to the project's documents and fills in the form. Always review it.
export async function scanQuoteFile(projectId: string, fileId: string): Promise<ScanResult> {
  await requireQuoteAdmin(projectId);
  const [file] = await db.select().from(projectFiles).where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, projectId)));
  if (!file) return { error: "That file isn't on this job." };
  if (!/\.pdf$/i.test(file.filename)) return { error: "Only a PDF can be read automatically. Type the quote details in below." };
  try {
    const scanned = await scanQuotePdf(await getObjectBuffer(file.storageKey));
    return {
      number: scanned.number ?? undefined,
      quoteDate: scanned.date ?? undefined,
      expires: scanned.expires ?? undefined,
      customer: scanned.customer ?? undefined,
      total: scanned.total ?? undefined,
      lines: scanned.lines,
    };
  } catch {
    return { error: "Couldn't read that quote automatically. Type the details in below." };
  }
}

export async function saveQuote(projectId: string, input: QuoteInput, quoteId?: string): Promise<{ error?: string }> {
  const { project } = await requireQuoteAdmin(projectId);
  const fields = cleanQuoteFields({ number: input.number, quoteDate: input.quoteDate, total: input.total, expires: input.expires });
  if ("error" in fields) return { error: fields.error };
  const link = cleanQbLink(input.qbLink || "");
  if ("error" in link) return { error: link.error };
  const lines = cleanQuoteLines(input.lines);
  if ("error" in lines) return { error: lines.error };

  if (input.fileId) {
    const [file] = await db.select({ id: projectFiles.id }).from(projectFiles).where(and(eq(projectFiles.id, input.fileId), eq(projectFiles.projectId, projectId)));
    if (!file) return { error: "That quote file isn't on this job." };
  }

  const values = {
    number: fields.number,
    quoteDate: fields.quoteDate,
    customer: input.customer.trim() || project.customer || null,
    total: fields.total as never,
    expires: fields.expires,
    qbLink: link.link,
    lines: lines.lines,
    fileId: input.fileId || null,
  };
  if (quoteId) {
    const [existing] = await db.select({ id: projectQuotes.id }).from(projectQuotes).where(and(eq(projectQuotes.id, quoteId), eq(projectQuotes.projectId, projectId)));
    if (!existing) return { error: "That quote no longer exists." };
    await db.update(projectQuotes).set(values).where(eq(projectQuotes.id, quoteId));
  } else {
    await db.insert(projectQuotes).values({ id: randomUUID(), projectId, ...values });
  }
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// Removes the quote record. The PDF stays in the job's documents.
export async function deleteQuote(projectId: string, quoteId: string): Promise<{ error?: string }> {
  await requireQuoteAdmin(projectId);
  await db.delete(projectQuotes).where(and(eq(projectQuotes.id, quoteId), eq(projectQuotes.projectId, projectId)));
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// After the invoice is made in QuickBooks: remember which invoice it was, and (optionally) mark the job Billed once
// every quote on it has been billed.
export async function recordQuoteBilled(
  projectId: string,
  quoteId: string,
  input: { invoiceNo: string; date: string; amount: string | number; markJobBilled: boolean }
): Promise<{ error?: string }> {
  const { project, name } = await requireQuoteAdmin(projectId);
  const invoiceNo = input.invoiceNo.trim();
  const amount = Number(String(input.amount).replace(/[$,\s]/g, ""));
  if (!invoiceNo) return { error: "Enter the QuickBooks invoice number." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) return { error: "Enter the invoice date." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the invoice amount." };

  const [quote] = await db.select({ id: projectQuotes.id }).from(projectQuotes).where(and(eq(projectQuotes.id, quoteId), eq(projectQuotes.projectId, projectId)));
  if (!quote) return { error: "That quote no longer exists." };
  await db
    .update(projectQuotes)
    .set({ billedInvoiceNo: invoiceNo, billedDate: input.date, billedAmount: (Math.round(amount * 100) / 100) as never, billedBy: name })
    .where(eq(projectQuotes.id, quoteId));

  if (input.markJobBilled) {
    const all = await db.select({ billedInvoiceNo: projectQuotes.billedInvoiceNo }).from(projectQuotes).where(eq(projectQuotes.projectId, projectId));
    if (all.every((q) => q.billedInvoiceNo) && project.status !== "billed" && project.status !== "canceled") {
      await db.update(projects).set({ status: "billed" }).where(eq(projects.id, projectId));
    }
  }
  revalidatePath(`/projects/${projectId}`);
  return {};
}

type QbEstimate = {
  Id: string;
  DocNumber?: string;
  TxnStatus?: string;
  TotalAmt?: number;
  CustomerRef?: { value: string; name?: string };
  CustomerMemo?: { value?: string };
  BillEmail?: { Address?: string };
  TxnTaxDetail?: { TotalTax?: number };
  Line?: { DetailType: string; Amount?: number; Description?: string; SalesItemLineDetail?: { ItemRef?: { value: string; name?: string }; Qty?: number; UnitPrice?: number; TaxCodeRef?: { value: string }; ClassRef?: { value: string } } }[];
};

export type CreateInvoiceResult = { error?: string; link?: string; docNumber?: string; note?: string };

// One click for a job billed from a quote: creates the invoice in QuickBooks from the quote's own estimate (same lines
// and message, linked to it so QuickBooks closes the quote), puts the daily logs on it as backup, records it here, and
// hands back the link so the person can review it in QuickBooks. Nothing is ever emailed from here.
export async function createInvoiceFromQuote(projectId: string, quoteId: string): Promise<CreateInvoiceResult> {
  try {
    const { project, name } = await requireQuoteAdmin(projectId);
    const companyId = project.companyId;
    if (!qbConfig().configured) return { error: "QuickBooks isn't set up for White Board yet." };
    const conn = await getConnection(companyId);
    if (!conn) return { error: "QuickBooks isn't connected for this company. Use Connect QuickBooks first." };

    const [quote] = await db.select().from(projectQuotes).where(and(eq(projectQuotes.id, quoteId), eq(projectQuotes.projectId, projectId)));
    if (!quote) return { error: "That quote no longer exists." };
    if (quote.billedInvoiceNo) return { error: `Invoice #${quote.billedInvoiceNo} is already recorded for this quote.` };

    const estimates = await qbQuery<QbEstimate>(companyId, `select * from Estimate where DocNumber = '${qbQuote(quote.number)}'`, "Estimate");
    if (estimates.length !== 1) return { error: estimates.length ? `QuickBooks has more than one quote numbered ${quote.number}.` : `QuickBooks has no quote numbered ${quote.number}.` };
    const est = estimates[0];
    if (est.TxnStatus === "Closed") return { error: "QuickBooks shows this quote as already invoiced. Open it in QuickBooks to find the invoice, then record it here." };
    if ((est.TxnTaxDetail?.TotalTax || 0) > 0) return { error: "This quote has sales tax on it. Create the invoice from the quote in QuickBooks." };

    const lines = (est.Line || []).filter((l) => l.DetailType !== "SubTotalLineDetail");
    if (!lines.length || lines.some((l) => l.DetailType !== "SalesItemLineDetail" || !l.SalesItemLineDetail?.ItemRef)) {
      return { error: "This quote has discounts or lines I can't copy exactly. Create the invoice from the quote in QuickBooks." };
    }

    // Bill the QuickBooks job named with the project number (so income lands on the job); otherwise the quote's customer.
    const customer = est.CustomerRef ? await findJobCustomer(companyId, project.projectNumber, est.CustomerRef.name || null).catch(() => null) : null;
    const billTo = customer && typeof customer !== "string" ? customer.Id : est.CustomerRef?.value;
    if (!billTo) return { error: "The quote in QuickBooks has no customer." };

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const payload = {
      CustomerRef: { value: billTo },
      TxnDate: today,
      ...(est.CustomerMemo?.value ? { CustomerMemo: { value: est.CustomerMemo.value } } : {}),
      // The customer's email from the quote stays on the invoice (Jacob wants it there). It is only an address: nothing is
      // sent, because invoices are downloaded as PDFs and emailed by hand.
      ...(est.BillEmail?.Address ? { BillEmail: { Address: est.BillEmail.Address } } : {}),
      PrivateNote: `From White Board: quote #${quote.number}`,
      LinkedTxn: [{ TxnId: est.Id, TxnType: "Estimate" }],
      Line: lines.map((l) => ({
        DetailType: "SalesItemLineDetail",
        Amount: l.Amount,
        Description: l.Description,
        SalesItemLineDetail: {
          ItemRef: l.SalesItemLineDetail!.ItemRef,
          Qty: l.SalesItemLineDetail!.Qty,
          UnitPrice: l.SalesItemLineDetail!.UnitPrice,
          TaxCodeRef: l.SalesItemLineDetail!.TaxCodeRef || { value: "NON" },
          ...(l.SalesItemLineDetail!.ClassRef ? { ClassRef: l.SalesItemLineDetail!.ClassRef } : {}),
        },
      })),
    };
    const created = await qbApi<{ Invoice?: { Id: string; DocNumber?: string; TotalAmt?: number } }>(companyId, "POST", "/invoice", payload);
    const inv = created.Invoice;
    if (!inv?.Id) return { error: "QuickBooks didn't confirm the invoice. Check QuickBooks before trying again." };

    await db
      .update(projectQuotes)
      .set({ billedInvoiceNo: inv.DocNumber || null, billedDate: today, billedAmount: (inv.TotalAmt ?? quote.total) as never, billedBy: name, qbInvoiceId: inv.Id })
      .where(eq(projectQuotes.id, quoteId));

    // The daily logs go on the invoice as backup. If that fails the invoice is still there.
    let note = typeof customer === "string" ? `Billed to ${est.CustomerRef?.name || "the quote's customer"}: QuickBooks has no job for ${project.projectNumber || "this project"} yet. You can change the customer on the invoice.` : undefined;
    try {
      const logs = await db.select().from(dailyLogs).where(eq(dailyLogs.projectId, projectId));
      if (logs.length) {
        logs.sort((a, b) => a.date.localeCompare(b.date));
        const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
        const items = await db.select().from(lineItems).where(eq(lineItems.projectId, projectId));
        const pdf = await buildDailyLogsPdf(
          { name: project.name, projectNumber: project.projectNumber, customer: project.customer, location: project.location, companyName: company?.name ?? "" },
          logs.map((l) => ({
            date: l.date,
            foreman: l.foreman,
            leakNumber: l.leakNumber,
            taskNumber: l.taskNumber,
            locusviewNumber: l.locusviewNumber,
            address: l.address,
            lineItem: l.lineItem,
            lineItemDescription: l.lineItem ? items.find((i) => i.itemNo === l.lineItem)?.description || null : null,
            quantities: [],
            crew: l.crew || [],
            description: l.description,
            scopeChange: l.scopeChange,
          })),
          `${logs[0].date} to ${logs[logs.length - 1].date}`
        );
        await qbAttach(companyId, "Invoice", inv.Id, `Daily-Logs-${project.projectNumber || "job"}.pdf`, "application/pdf", Buffer.from(pdf));
      }
    } catch {
      note = [note, "The invoice is in QuickBooks, but the daily logs PDF couldn't be attached. Export it from the Daily Logs section."].filter(Boolean).join(" ");
    }
    revalidatePath(`/projects/${projectId}`);
    return { docNumber: inv.DocNumber, link: qbInvoiceLink(conn.realmId, inv.Id), note };
  } catch (e) {
    if (e instanceof QbError) return { error: e.message };
    return { error: "Something went wrong creating the invoice in QuickBooks. Check QuickBooks before trying again." };
  }
}

// For a wrong invoice number or a voided invoice.
export async function clearQuoteBilled(projectId: string, quoteId: string): Promise<{ error?: string }> {
  const { project } = await requireQuoteAdmin(projectId);
  await db
    .update(projectQuotes)
    .set({ billedInvoiceNo: null, billedDate: null, billedAmount: null, billedBy: null })
    .where(and(eq(projectQuotes.id, quoteId), eq(projectQuotes.projectId, projectId)));
  if (project.status === "billed") await db.update(projects).set({ status: "complete" }).where(eq(projects.id, projectId));
  revalidatePath(`/projects/${projectId}`);
  return {};
}
