"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingRates, billingTasks, tmInvoices, dailyLogs, projects } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { buildInvoiceLineItems, sumLineItems, validateLineItems, findCrossCrewOverlaps, type TmLineItem } from "@/lib/tm-billing";
import * as XLSX from "xlsx";

// Real, server-enforced admin check — rates and invoice totals must never
// be computable by a non-admin session regardless of what the UI shows.
async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage T&M billing data.");
  }
}

export async function setBillingRate(projectId: string, position: string, hourlyRate: number) {
  await requireAdmin();
  const id = `${projectId}-${position}`.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
  await db
    .insert(billingRates)
    .values({ id, projectId, position, hourlyRate: hourlyRate as never })
    .onConflictDoUpdate({ target: billingRates.id, set: { hourlyRate: hourlyRate as never } });
  revalidatePath(`/projects/${projectId}`);
}

export async function addBillingTask(projectId: string, formData: FormData) {
  await requireAdmin();
  const taskNumber = String(formData.get("taskNumber") || "").trim();
  if (!taskNumber) return;
  await db.insert(billingTasks).values({
    id: randomUUID(),
    projectId,
    taskNumber,
    projectName: String(formData.get("projectName") || "").trim() || null,
    taskRequestNo: String(formData.get("taskRequestNo") || "").trim() || null,
    contractCoordinator: String(formData.get("contractCoordinator") || "").trim() || null,
    billToName: String(formData.get("billToName") || "").trim() || null,
    billToAddress: String(formData.get("billToAddress") || "").trim() || null,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteBillingTask(projectId: string, id: string) {
  await requireAdmin();
  await db.delete(billingTasks).where(eq(billingTasks.id, id));
  revalidatePath(`/projects/${projectId}`);
}

// Screens line items against every other project's daily logs for the same
// period, so a crew member billed here who was also logged under a
// different crew on the same date gets flagged as an overlap.
async function computeWarnings(projectId: string, periodStart: string, periodEnd: string, items: TmLineItem[]) {
  const [periodLogs, allProjects] = await Promise.all([
    db.select().from(dailyLogs).where(and(gte(dailyLogs.date, periodStart), lte(dailyLogs.date, periodEnd))),
    db.select().from(projects),
  ]);
  const projectNameById = new Map(allProjects.map((p) => [p.id, p.name]));
  const otherLogs = periodLogs
    .filter((l) => l.projectId !== projectId)
    .map((l) => ({ projectId: l.projectId, projectName: projectNameById.get(l.projectId) || l.projectId, date: l.date, crew: l.crew }));

  return [...validateLineItems(items), ...findCrossCrewOverlaps(items, projectId, otherLogs)];
}

export async function generateInvoice(
  projectId: string,
  billingTaskId: string,
  periodStart: string,
  periodEnd: string
) {
  await requireAdmin();
  if (!periodStart || !periodEnd) throw new Error("Pick a start and end date for the billing period.");

  const [task] = await db.select().from(billingTasks).where(eq(billingTasks.id, billingTaskId));
  if (!task) throw new Error("That billing task no longer exists.");

  const [logs, rates] = await Promise.all([
    db.select().from(dailyLogs).where(eq(dailyLogs.projectId, projectId)),
    db.select().from(billingRates).where(eq(billingRates.projectId, projectId)),
  ]);

  const lineItems = buildInvoiceLineItems(logs, rates, task.taskNumber, periodStart, periodEnd);
  if (!lineItems.length) {
    throw new Error("No daily log hours found for that task number in the selected period.");
  }
  const total = sumLineItems(lineItems);
  const warnings = await computeWarnings(projectId, periodStart, periodEnd, lineItems);

  const [invoice] = await db
    .insert(tmInvoices)
    .values({
      id: randomUUID(),
      projectId,
      billingTaskId,
      periodStart,
      periodEnd,
      status: "draft",
      total: total as never,
      lineItems,
      warnings,
    })
    .returning();

  revalidatePath(`/projects/${projectId}`);
  return invoice.id;
}

export async function removeInvoiceLineItem(projectId: string, invoiceId: string, lineIndex: number) {
  await requireAdmin();
  const [invoice] = await db
    .select()
    .from(tmInvoices)
    .where(and(eq(tmInvoices.id, invoiceId), eq(tmInvoices.projectId, projectId)));
  if (!invoice) throw new Error("Invoice not found.");

  const items = (invoice.lineItems || []).filter((_, i) => i !== lineIndex);
  const total = sumLineItems(items);
  const warnings = await computeWarnings(projectId, invoice.periodStart, invoice.periodEnd, items);

  await db
    .update(tmInvoices)
    .set({ lineItems: items, total: total as never, warnings })
    .where(eq(tmInvoices.id, invoiceId));
  revalidatePath(`/projects/${projectId}`);
}

export async function approveInvoice(projectId: string, id: string) {
  await requireAdmin();
  await db
    .update(tmInvoices)
    .set({ status: "approved", approvedAt: new Date() })
    .where(and(eq(tmInvoices.id, id), eq(tmInvoices.projectId, projectId)));
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteTmInvoice(projectId: string, id: string) {
  await requireAdmin();
  await db.delete(tmInvoices).where(and(eq(tmInvoices.id, id), eq(tmInvoices.projectId, projectId)));
  revalidatePath(`/projects/${projectId}`);
}

export async function setInvoiceNumber(projectId: string, id: string, invoiceNumber: string) {
  await requireAdmin();
  await db
    .update(tmInvoices)
    .set({ invoiceNumber: invoiceNumber.trim() || null })
    .where(and(eq(tmInvoices.id, id), eq(tmInvoices.projectId, projectId)));
  revalidatePath(`/projects/${projectId}`);
}

export async function exportInvoiceExcel(projectId: string, id: string): Promise<{ filename: string; base64: string }> {
  await requireAdmin();
  const [invoice] = await db
    .select()
    .from(tmInvoices)
    .where(and(eq(tmInvoices.id, id), eq(tmInvoices.projectId, projectId)));
  if (!invoice) throw new Error("Invoice not found.");
  const [task] = await db.select().from(billingTasks).where(eq(billingTasks.id, invoice.billingTaskId));

  const warnings = invoice.warnings || [];
  const flagsFor = (li: { crewMember: string; date: string }) =>
    warnings
      .filter((w) => w.crewMember === li.crewMember && w.date === li.date)
      .map((w) => w.message)
      .join("; ");

  const header = [
    ["Task / Project Number", task?.taskNumber || ""],
    ["Project Name", task?.projectName || ""],
    ["Task Request No.", task?.taskRequestNo || ""],
    ["Contract Coordinator", task?.contractCoordinator || ""],
    ["Bill To", task?.billToName || ""],
    ["Bill To Address", task?.billToAddress || ""],
    ["Period", `${invoice.periodStart} to ${invoice.periodEnd}`],
    ["Invoice #", invoice.invoiceNumber || ""],
    [],
    ["Date", "Crew Member", "Position", "Leak #", "Locusview #", "Address", "Hours", "Rate", "Amount", "Flags"],
  ];

  const rows = (invoice.lineItems || []).map((li) => [
    li.date,
    li.crewMember,
    li.position,
    li.leakNumber,
    li.locusviewNumber,
    li.address,
    li.hours,
    li.rate,
    li.amount,
    flagsFor(li),
  ]);
  rows.push(["", "", "", "", "", "", "", "Total", Number(invoice.total), ""]);

  if (warnings.length) {
    rows.push([]);
    rows.push(["Flagged Issues", "", "", "", "", "", "", "", "", ""]);
    for (const w of warnings) {
      rows.push([w.severity.toUpperCase(), w.message, "", "", "", "", "", "", "", ""]);
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet([...header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Invoice");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const filename = `TM-Invoice-${task?.taskNumber || "invoice"}-${invoice.periodStart}_${invoice.periodEnd}.xlsx`;
  return { filename, base64: buf.toString("base64") };
}
