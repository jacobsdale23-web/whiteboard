"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingTasks, projectQuotes, tmInvoices } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireProject } from "@/lib/auth/company";
import { disconnect, findJobCustomer, getConnection, nextInvoiceNumber, qbApi, qbAttach, qbConfig, qbInvoicePdf, qbQuery, QbError } from "@/lib/quickbooks";
import { buildCustomerMemo, buildQbLines, qbInvoiceLink, type QbLine } from "@/lib/qb-invoice";
import { exportInvoiceExcel } from "./billing-actions";

async function requireQbAdmin(projectId: string) {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") throw new Error("Only admins can send invoices to QuickBooks.");
  const project = await requireProject(projectId);
  return { project, name: current.profile.name };
}

export type SendResult = { error?: string; docNumber?: string; note?: string; link?: string };

const salesLines = (lines: QbLine[], item: { value: string; name?: string }) =>
  lines.map((l) => ({
    DetailType: "SalesItemLineDetail",
    Amount: l.amount,
    Description: l.description,
    SalesItemLineDetail: { ItemRef: item, Qty: l.qty, UnitPrice: l.rate, TaxCodeRef: { value: "NON" } },
  }));

type QbInvoiceRecord = {
  Id: string;
  SyncToken: string;
  DocNumber?: string;
  TotalAmt?: number;
  Line?: { DetailType?: string; SalesItemLineDetail?: { ItemRef?: { value: string; name?: string } } }[];
};

// Rewrites the lines of an invoice White Board already created in QuickBooks (by job site, or back to by rate). The
// total never changes: if QuickBooks shows a different total (someone edited it there), nothing is written.
export async function updateQbInvoiceLines(projectId: string, invoiceId: string, bySite: boolean): Promise<SendResult> {
  try {
    const { project } = await requireQbAdmin(projectId);
    const companyId = project.companyId;
    const conn = await getConnection(companyId);
    if (!conn) return { error: "QuickBooks isn't connected for this company. Use Connect QuickBooks first." };

    const [invoice] = await db.select().from(tmInvoices).where(and(eq(tmInvoices.id, invoiceId), eq(tmInvoices.projectId, projectId)));
    if (!invoice?.qbInvoiceId) return { error: "This invoice isn't in QuickBooks yet." };

    const built = buildQbLines(invoice.lineItems || [], Number(invoice.total), { bySite });
    if ("error" in built) return { error: built.error };

    const current = (await qbApi<{ Invoice?: QbInvoiceRecord }>(companyId, "GET", `/invoice/${encodeURIComponent(invoice.qbInvoiceId)}`)).Invoice;
    if (!current?.Id) return { error: "Couldn't find that invoice in QuickBooks." };
    if (Math.abs(Number(current.TotalAmt) - Number(invoice.total)) > 0.005) {
      return { error: `QuickBooks shows $${Number(current.TotalAmt).toFixed(2)} for this invoice but White Board has $${Number(invoice.total).toFixed(2)}. It looks changed in QuickBooks, so nothing was updated.` };
    }
    const item = current.Line?.find((l) => l.DetailType === "SalesItemLineDetail")?.SalesItemLineDetail?.ItemRef;
    if (!item) return { error: "Couldn't read the product on the QuickBooks invoice, so nothing was updated." };

    // A sparse update replaces only the lines; customer, number, memo and attachments stay as they are.
    await qbApi(companyId, "POST", "/invoice", { Id: current.Id, SyncToken: current.SyncToken, sparse: true, Line: salesLines(built.lines, item) });
    revalidatePath(`/projects/${projectId}`);
    return { docNumber: current.DocNumber, note: `QuickBooks invoice ${current.DocNumber || ""} now has ${built.lines.length} line${built.lines.length === 1 ? "" : "s"}. If you already downloaded or emailed the PDF, download it again.`, link: qbInvoiceLink(conn.realmId, current.Id) };
  } catch (e) {
    if (e instanceof QbError) return { error: e.message };
    return { error: "Something went wrong updating this in QuickBooks. Check the invoice there before trying again." };
  }
}

// Creates this approved invoice in QuickBooks (saved there, not emailed) with the "Per Man / Per Welder" lines (by rate,
// or broken out by job site) and the task details on top, attaches the Excel backup, and remembers where it went.
export async function sendInvoiceToQuickBooks(projectId: string, invoiceId: string, bySite = false): Promise<SendResult> {
  try {
    const { project, name } = await requireQbAdmin(projectId);
    const companyId = project.companyId;
    if (!qbConfig().configured) return { error: "QuickBooks isn't set up for White Board yet." };
    const conn = await getConnection(companyId);
    if (!conn) return { error: "QuickBooks isn't connected for this company. Use Connect QuickBooks first." };

    const [invoice] = await db.select().from(tmInvoices).where(and(eq(tmInvoices.id, invoiceId), eq(tmInvoices.projectId, projectId)));
    if (!invoice) return { error: "Invoice not found." };
    if (invoice.status !== "approved") return { error: "Approve the invoice first." };
    if (invoice.qbInvoiceId) return { error: "This invoice was already sent to QuickBooks." };
    const [task] = await db.select().from(billingTasks).where(eq(billingTasks.id, invoice.billingTaskId));

    const built = buildQbLines(invoice.lineItems || [], Number(invoice.total), { bySite });
    if ("error" in built) return { error: built.error };

    const customer = await findJobCustomer(companyId, project.projectNumber, task?.billToName ?? null);
    if (typeof customer === "string") return { error: customer };

    const items = await qbQuery<{ Id: string; Name: string }>(companyId, "select Id, Name from Item where Name = 'Labor & Equipment'", "Item");
    if (!items.length) return { error: 'QuickBooks has no product/service called "Labor & Equipment".' };

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const docNumber = await nextInvoiceNumber(companyId);
    const payload = {
      CustomerRef: { value: customer.Id },
      ...(docNumber ? { DocNumber: docNumber } : {}),
      TxnDate: today,
      CustomerMemo: { value: buildCustomerMemo(task, invoice.periodStart, invoice.periodEnd) },
      PrivateNote: `From White Board: T&M invoice ${task?.taskNumber || ""} ${invoice.periodStart} to ${invoice.periodEnd}`.trim(),
      Line: salesLines(built.lines, { value: items[0].Id, name: items[0].Name }),
    };
    const created = await qbApi<{ Invoice?: { Id: string; DocNumber?: string; TotalAmt?: number } }>(companyId, "POST", "/invoice", payload);
    const qbInv = created.Invoice;
    if (!qbInv?.Id) return { error: "QuickBooks didn't confirm the invoice. Check QuickBooks before sending again." };

    await db
      .update(tmInvoices)
      .set({ qbInvoiceId: qbInv.Id, qbSentAt: new Date(), qbSentBy: name, invoiceNumber: qbInv.DocNumber || invoice.invoiceNumber })
      .where(eq(tmInvoices.id, invoiceId));

    // The Excel backup goes on the QuickBooks invoice too. If that fails the invoice is still there.
    let note: string | undefined = docNumber ? undefined : "I couldn't work out the next invoice number, so the invoice has none yet. Type it in QuickBooks.";
    try {
      const { filename, base64 } = await exportInvoiceExcel(projectId, invoiceId);
      await qbAttach(companyId, "Invoice", qbInv.Id, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from(base64, "base64"));
    } catch {
      note = [note, "The invoice is in QuickBooks, but the Excel backup couldn't be attached to it. Export it from here and attach it."].filter(Boolean).join(" ");
    }
    revalidatePath(`/projects/${projectId}`);
    return { docNumber: qbInv.DocNumber, note, link: qbInvoiceLink(conn.realmId, qbInv.Id) };
  } catch (e) {
    if (e instanceof QbError) return { error: e.message };
    return { error: "Something went wrong sending this to QuickBooks. Check QuickBooks before trying again." };
  }
}

// The PDF of an invoice White Board created in QuickBooks (a T&M invoice or a quote's invoice on this job), straight
// from QuickBooks, so it can be downloaded and emailed by hand.
export async function downloadQbInvoicePdf(projectId: string, qbInvoiceId: string): Promise<{ error?: string; filename?: string; base64?: string }> {
  try {
    const { project } = await requireQbAdmin(projectId);
    const [tm] = await db.select({ n: tmInvoices.invoiceNumber }).from(tmInvoices).where(and(eq(tmInvoices.projectId, projectId), eq(tmInvoices.qbInvoiceId, qbInvoiceId)));
    const [quote] = tm ? [] : await db.select({ n: projectQuotes.billedInvoiceNo }).from(projectQuotes).where(and(eq(projectQuotes.projectId, projectId), eq(projectQuotes.qbInvoiceId, qbInvoiceId)));
    if (!tm && !quote) return { error: "That invoice isn't on this job." };
    const pdf = await qbInvoicePdf(project.companyId, qbInvoiceId);
    const number = (tm?.n || quote?.n || qbInvoiceId).replace(/[^A-Za-z0-9-]+/g, "");
    const job = (project.projectNumber || project.name).replace(/[^A-Za-z0-9]+/g, "_").slice(0, 30);
    return { filename: `Invoice-${number}-${job}.pdf`, base64: pdf.toString("base64") };
  } catch (e) {
    if (e instanceof QbError) return { error: e.message };
    return { error: "Couldn't get the PDF from QuickBooks. Open the invoice there instead." };
  }
}

export async function disconnectQuickBooks(projectId: string): Promise<{ error?: string }> {
  const { project } = await requireQbAdmin(projectId);
  await disconnect(project.companyId);
  revalidatePath(`/projects/${projectId}`);
  return {};
}
