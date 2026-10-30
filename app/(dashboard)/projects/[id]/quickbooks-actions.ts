"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingTasks, tmInvoices } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireProject } from "@/lib/auth/company";
import { disconnect, getConnection, qbApi, qbAttach, qbConfig, qbQuery, qbQuote, QbError } from "@/lib/quickbooks";
import { buildCustomerMemo, buildQbLines } from "@/lib/qb-invoice";
import { exportInvoiceExcel } from "./billing-actions";

async function requireQbAdmin(projectId: string) {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") throw new Error("Only admins can send invoices to QuickBooks.");
  const project = await requireProject(projectId);
  return { project, name: current.profile.name };
}

type QbCustomer = { Id: string; DisplayName: string };

// The QuickBooks customer (job) this invoice is billed to: the job named with the project number ("26100 - Luling 8"
// Ph 1"), or else the bill-to name on the billing task. Never guessed and never created.
async function findCustomer(companyId: string, projectNumber: string | null, billToName: string | null): Promise<QbCustomer | string> {
  if (projectNumber) {
    const found = await qbQuery<QbCustomer>(companyId, `select Id, DisplayName from Customer where DisplayName like '${qbQuote(projectNumber)}%'`, "Customer");
    const exact = found.filter((c) => c.DisplayName.startsWith(`${projectNumber} -`) || c.DisplayName === projectNumber);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return `QuickBooks has more than one job starting ${projectNumber} (${exact.map((c) => c.DisplayName).join("; ")}). Send this one by hand, or tell Jacob.`;
  }
  if (billToName) {
    const found = await qbQuery<QbCustomer>(companyId, `select Id, DisplayName from Customer where DisplayName = '${qbQuote(billToName)}'`, "Customer");
    if (found.length === 1) return found[0];
  }
  return `QuickBooks has no job ${projectNumber ? `named ${projectNumber} - ...` : "for this project"} yet${billToName ? ` and no customer named "${billToName}"` : ""}. Create the job in QuickBooks first (or add the Bill-to name on the billing task), then send again.`;
}

export type SendResult = { error?: string; docNumber?: string; note?: string };

// Creates this approved invoice in QuickBooks (saved there, not emailed) with the short "Per Man / Per Welder" lines and
// the task details on top, attaches the Excel backup, and remembers where it went.
export async function sendInvoiceToQuickBooks(projectId: string, invoiceId: string): Promise<SendResult> {
  try {
    const { project, name } = await requireQbAdmin(projectId);
    const companyId = project.companyId;
    if (!qbConfig().configured) return { error: "QuickBooks isn't set up for White Board yet." };
    if (!(await getConnection(companyId))) return { error: "QuickBooks isn't connected for this company. Use Connect QuickBooks first." };

    const [invoice] = await db.select().from(tmInvoices).where(and(eq(tmInvoices.id, invoiceId), eq(tmInvoices.projectId, projectId)));
    if (!invoice) return { error: "Invoice not found." };
    if (invoice.status !== "approved") return { error: "Approve the invoice first." };
    if (invoice.qbInvoiceId) return { error: "This invoice was already sent to QuickBooks." };
    const [task] = await db.select().from(billingTasks).where(eq(billingTasks.id, invoice.billingTaskId));

    const built = buildQbLines(invoice.lineItems || [], Number(invoice.total));
    if ("error" in built) return { error: built.error };

    const customer = await findCustomer(companyId, project.projectNumber, task?.billToName ?? null);
    if (typeof customer === "string") return { error: customer };

    const items = await qbQuery<{ Id: string; Name: string }>(companyId, "select Id, Name from Item where Name = 'Labor & Equipment'", "Item");
    if (!items.length) return { error: 'QuickBooks has no product/service called "Labor & Equipment".' };

    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    const payload = {
      CustomerRef: { value: customer.Id },
      TxnDate: today,
      CustomerMemo: { value: buildCustomerMemo(task, invoice.periodStart, invoice.periodEnd) },
      PrivateNote: `From White Board: T&M invoice ${task?.taskNumber || ""} ${invoice.periodStart} to ${invoice.periodEnd}`.trim(),
      Line: built.lines.map((l) => ({
        DetailType: "SalesItemLineDetail",
        Amount: l.amount,
        Description: l.description,
        SalesItemLineDetail: { ItemRef: { value: items[0].Id, name: items[0].Name }, Qty: l.qty, UnitPrice: l.rate, TaxCodeRef: { value: "NON" } },
      })),
    };
    const created = await qbApi<{ Invoice?: { Id: string; DocNumber?: string; TotalAmt?: number } }>(companyId, "POST", "/invoice", payload);
    const qbInv = created.Invoice;
    if (!qbInv?.Id) return { error: "QuickBooks didn't confirm the invoice. Check QuickBooks before sending again." };

    await db
      .update(tmInvoices)
      .set({ qbInvoiceId: qbInv.Id, qbSentAt: new Date(), qbSentBy: name, invoiceNumber: qbInv.DocNumber || invoice.invoiceNumber })
      .where(eq(tmInvoices.id, invoiceId));

    // The Excel backup goes on the QuickBooks invoice too. If that fails the invoice is still there.
    let note: string | undefined;
    try {
      const { filename, base64 } = await exportInvoiceExcel(projectId, invoiceId);
      await qbAttach(companyId, "Invoice", qbInv.Id, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", Buffer.from(base64, "base64"));
    } catch {
      note = "The invoice is in QuickBooks, but the Excel backup couldn't be attached to it. Export it from here and attach it.";
    }
    revalidatePath(`/projects/${projectId}`);
    return { docNumber: qbInv.DocNumber, note };
  } catch (e) {
    if (e instanceof QbError) return { error: e.message };
    return { error: "Something went wrong sending this to QuickBooks. Check QuickBooks before trying again." };
  }
}

export async function disconnectQuickBooks(projectId: string): Promise<{ error?: string }> {
  const { project } = await requireQbAdmin(projectId);
  await disconnect(project.companyId);
  revalidatePath(`/projects/${projectId}`);
  return {};
}
