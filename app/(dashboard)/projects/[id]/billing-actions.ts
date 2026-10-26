"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, and, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingRates, billingTasks, tmInvoices, dailyLogs, projects, crew, hrEmployees } from "@/lib/db/schema";
import { cellValue, descriptionFor, screenInvoiceQuality, type QualityField } from "@/lib/tm-quality";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { buildInvoiceLineItems, sumLineItems, validateLineItems, findCrossCrewOverlaps, type TmLineItem } from "@/lib/tm-billing";
import { RATE_SCHEDULES, type RateScheduleKey } from "@/lib/rate-schedules";
import ExcelJS from "exceljs";

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

// Fills in a project's hourly rates from one of the standard schedules
// (Louisiana / Jackson). Positions already on the project are overwritten with
// the schedule's rate; positions outside the schedule are left alone.
export async function applyRateSchedule(projectId: string, key: RateScheduleKey): Promise<{ error?: string }> {
  await requireAdmin();
  const schedule = RATE_SCHEDULES[key];
  if (!schedule) return { error: "Unknown rate schedule." };
  for (const [position, rate] of Object.entries(schedule.rates)) {
    const id = `${projectId}-${position}`.toLowerCase().replace(/[^a-z0-9._-]/g, "_");
    await db
      .insert(billingRates)
      .values({ id, projectId, position, hourlyRate: rate as never })
      .onConflictDoUpdate({ target: billingRates.id, set: { hourlyRate: rate as never } });
  }
  revalidatePath(`/projects/${projectId}`);
  return {};
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
type StoredWarning = NonNullable<(typeof tmInvoices.$inferSelect)["warnings"]>[number];

async function computeWarnings(projectId: string, taskNumber: string, periodStart: string, periodEnd: string, items: TmLineItem[]): Promise<StoredWarning[]> {
  const thisProject = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  const companyId = thisProject?.companyId;
  const [periodLogs, allProjects, people, employees] = await Promise.all([
    db.select().from(dailyLogs).where(and(gte(dailyLogs.date, periodStart), lte(dailyLogs.date, periodEnd))),
    // Overlaps are only checked within the same company.
    companyId ? db.select().from(projects).where(eq(projects.companyId, companyId)) : Promise.resolve([]),
    // Full names to suggest when a crew name was abbreviated.
    companyId ? db.select({ name: crew.name }).from(crew).where(eq(crew.companyId, companyId)) : Promise.resolve([]),
    companyId ? db.select({ name: hrEmployees.name }).from(hrEmployees).where(eq(hrEmployees.companyId, companyId)) : Promise.resolve([]),
  ]);
  const projectNameById = new Map(allProjects.map((p) => [p.id, p.name]));
  const otherLogs = periodLogs
    .filter((l) => l.projectId !== projectId && projectNameById.has(l.projectId))
    .map((l) => ({ projectId: l.projectId, projectName: projectNameById.get(l.projectId) || l.projectId, date: l.date, crew: l.crew }));

  const taskLogs = periodLogs.filter((l) => l.projectId === projectId && l.taskNumber === taskNumber);
  const quality = screenInvoiceQuality(
    items,
    [...people, ...employees].map((p) => p.name),
    (li) => descriptionFor(li, taskLogs)
  );

  return [...validateLineItems(items), ...findCrossCrewOverlaps(items, projectId, otherLogs), ...quality];
}

// Screens a saved invoice again against the current logs and rules, and stores
// the result so the review screen and the Excel export agree.
async function rescreen(invoice: typeof tmInvoices.$inferSelect) {
  const [task] = await db.select().from(billingTasks).where(eq(billingTasks.id, invoice.billingTaskId));
  const warnings = await computeWarnings(invoice.projectId, task?.taskNumber ?? "", invoice.periodStart, invoice.periodEnd, invoice.lineItems || []);
  await db.update(tmInvoices).set({ warnings }).where(eq(tmInvoices.id, invoice.id));
  return warnings;
}

export async function rescreenInvoice(projectId: string, id: string) {
  await requireAdmin();
  const [invoice] = await db
    .select()
    .from(tmInvoices)
    .where(and(eq(tmInvoices.id, id), eq(tmInvoices.projectId, projectId)));
  if (!invoice) throw new Error("Invoice not found.");
  await rescreen(invoice);
  revalidatePath(`/projects/${projectId}`);
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
  const warnings = await computeWarnings(projectId, task.taskNumber, periodStart, periodEnd, lineItems);

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
  const [task] = await db.select().from(billingTasks).where(eq(billingTasks.id, invoice.billingTaskId));
  const warnings = await computeWarnings(projectId, task?.taskNumber ?? "", invoice.periodStart, invoice.periodEnd, items);

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

const CURRENCY = '"$"#,##0.00';
const NAVY = "FF0C2140";

const HIGHLIGHT = "FFFFE699"; // amber: a cell the screening wants double-checked
const FIELD_COLUMN: Record<string, number> = { crewMember: 2, position: 3, leakNumber: 4, locusviewNumber: 5, address: 6, description: 7, hours: 8 };

// Rough row height for wrapped text: not every viewer sizes rows for us.
const lineCount = (text: string, width: number) => text.split("\n").reduce((n, p) => n + Math.max(1, Math.ceil(p.length / (width * 1.05))), 0);

export async function exportInvoiceExcel(projectId: string, id: string): Promise<{ filename: string; base64: string }> {
  await requireAdmin();
  const [invoice] = await db
    .select()
    .from(tmInvoices)
    .where(and(eq(tmInvoices.id, id), eq(tmInvoices.projectId, projectId)));
  if (!invoice) throw new Error("Invoice not found.");
  const [task] = await db.select().from(billingTasks).where(eq(billingTasks.id, invoice.billingTaskId));
  const allLogs = await db.select().from(dailyLogs).where(eq(dailyLogs.projectId, projectId));
  const logs = allLogs
    .filter((l) => l.taskNumber === task?.taskNumber && l.date >= invoice.periodStart && l.date <= invoice.periodEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.leakNumber.localeCompare(b.leakNumber));

  // Screen again at export time so the file reflects the current rules and logs.
  const warnings = await rescreen(invoice);
  const touches = (w: (typeof warnings)[number], li: { crewMember: string; date: string }) =>
    w.cells ? w.cells.some((c) => c.crewMember === li.crewMember && c.date === li.date) : w.crewMember === li.crewMember && w.date === li.date;
  const flagsFor = (li: { crewMember: string; date: string }) =>
    warnings
      .filter((w) => touches(w, li))
      .map((w) => w.message)
      .join("\n");
  const highlighted = new Set(warnings.flatMap((w) => (w.cells || []).map((c) => `${c.date}|${c.crewMember}|${c.field}|${c.value ?? ""}`)));

  // Same order as the invoice, but a job's crew sit together so its description
  // is shown once, on the first of their rows.
  const items = (invoice.lineItems || [])
    .map((li) => ({ li, description: descriptionFor(li, logs), jobKey: `${li.date}|${li.leakNumber}|${li.locusviewNumber}|${li.address}` }))
    .sort((a, b) => a.li.date.localeCompare(b.li.date) || a.jobKey.localeCompare(b.jobKey) || a.li.crewMember.localeCompare(b.li.crewMember));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Invoice", {
    views: [{ state: "frozen", ySplit: 8 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 12 }, // Date
    { width: 22 }, // Crew member
    { width: 15 }, // Position
    { width: 12 }, // Leak #
    { width: 14 }, // Locusview #
    { width: 30 }, // Address
    { width: 58 }, // Description
    { width: 9 }, // Hours
    { width: 12 }, // Rate
    { width: 14 }, // Amount
    { width: 36 }, // Flags
  ];

  const header: [string, string][] = [
    ["Task / Project Number", task?.taskNumber || ""],
    ["Project Name", task?.projectName || ""],
    ["Task Request No.", task?.taskRequestNo || ""],
    ["Contract Coordinator", task?.contractCoordinator || ""],
    ["Period", `${invoice.periodStart} to ${invoice.periodEnd}`],
  ];
  header.forEach(([k, v], i) => {
    const r = ws.getRow(i + 1);
    r.getCell(1).value = k;
    r.getCell(1).font = { bold: true };
    ws.mergeCells(i + 1, 1, i + 1, 2);
    r.getCell(3).value = v;
    ws.mergeCells(i + 1, 3, i + 1, 7);
  });

  // Header block is rows 1-5, then a spare row, a note row, and the table header on row 8.
  const headRow = ws.getRow(8);
  ["Date", "Crew Member", "Position", "Leak #", "Locusview #", "Address", "Description of Work", "Hours", "Rate", "Amount", "Flags"].forEach((t, i) => {
    const c = headRow.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: i >= 7 && i <= 9 ? "right" : "left", wrapText: true };
  });
  headRow.height = 22;

  const thin = { style: "thin" as const, color: { argb: "FFD0D5DD" } };
  let rowNo = 9;
  let prevKey = "";
  for (const { li, description, jobKey } of items) {
    const r = ws.getRow(rowNo);
    const first = jobKey !== prevKey;
    prevKey = jobKey;
    const shown = first ? description : "";
    const flags = flagsFor(li);
    r.getCell(1).value = li.date;
    r.getCell(2).value = li.crewMember;
    r.getCell(3).value = li.position;
    r.getCell(4).value = li.leakNumber;
    r.getCell(5).value = li.locusviewNumber;
    r.getCell(6).value = li.address;
    r.getCell(7).value = shown;
    r.getCell(8).value = li.hours;
    r.getCell(8).numFmt = "0.00";
    r.getCell(9).value = li.rate;
    r.getCell(9).numFmt = CURRENCY;
    r.getCell(10).value = li.amount;
    r.getCell(10).numFmt = CURRENCY;
    r.getCell(11).value = flags;
    for (let c = 1; c <= 11; c++) {
      r.getCell(c).alignment = { vertical: "top", wrapText: c === 6 || c === 7 || c === 11 };
      r.getCell(c).border = { bottom: thin };
    }
    // Amber cells are the ones the screening wants double-checked.
    for (const [field, col] of Object.entries(FIELD_COLUMN)) {
      if (field === "description" && !(first && !description)) continue; // only a job's blank description cell
      if (highlighted.has(`${li.date}|${li.crewMember}|${field}|${cellValue(li, field as QualityField)}`)) r.getCell(col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HIGHLIGHT } };
    }
    if (flags) r.getCell(11).font = { color: { argb: "FF9C5700" } };
    r.height = Math.max(15, 15 * Math.max(lineCount(li.address, 30), lineCount(shown, 58), lineCount(flags, 36)));
    rowNo++;
  }
  if (highlighted.size) {
    const note = ws.getRow(7).getCell(1);
    note.value = "Amber cells need a second look before this invoice goes out. See the Flags column and Flagged Issues below.";
    note.font = { italic: true, color: { argb: "FF9C5700" } };
  }

  const total = ws.getRow(rowNo);
  total.getCell(7).value = "Total";
  total.getCell(8).value = items.reduce((n, x) => n + (Number(x.li.hours) || 0), 0);
  total.getCell(8).numFmt = "0.00";
  total.getCell(10).value = Number(invoice.total);
  total.getCell(10).numFmt = CURRENCY;
  for (let c = 7; c <= 10; c++) {
    total.getCell(c).font = { bold: true };
    total.getCell(c).border = { top: { style: "medium", color: { argb: NAVY } } };
  }
  total.getCell(7).alignment = { horizontal: "right" };
  rowNo += 2;

  if (warnings.length) {
    ws.getRow(rowNo).getCell(1).value = "Flagged Issues";
    ws.getRow(rowNo).getCell(1).font = { bold: true };
    rowNo++;
    for (const w of warnings) {
      ws.getRow(rowNo).getCell(1).value = w.severity.toUpperCase();
      ws.getRow(rowNo).getCell(2).value = w.message;
      rowNo++;
    }
  }

  // Backup sheet: each daily log in the period, in full, to check the invoice against.
  const bs = wb.addWorksheet("Daily Log Backup", {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  bs.columns = [{ width: 12 }, { width: 12 }, { width: 14 }, { width: 30 }, { width: 18 }, { width: 34 }, { width: 9 }, { width: 62 }];
  ["Date", "Leak #", "Locusview #", "Address", "Foreman", "Crew (position, hours)", "Hours", "Description of Work"].forEach((t, i) => {
    const c = bs.getRow(1).getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { vertical: "middle", horizontal: i === 6 ? "right" : "left", wrapText: true };
  });
  logs.forEach((l, i) => {
    const r = bs.getRow(i + 2);
    const crew = l.crew || [];
    const crewText = crew.map((c) => `${c.name} (${c.position}, ${Number(c.hours) || 0}h)`).join("\n");
    const description = (l.description || "").trim();
    r.getCell(1).value = l.date;
    r.getCell(2).value = l.leakNumber;
    r.getCell(3).value = l.locusviewNumber || "";
    r.getCell(4).value = l.address || "";
    r.getCell(5).value = l.foreman || "";
    r.getCell(6).value = crewText;
    r.getCell(7).value = crew.reduce((n, c) => n + (Number(c.hours) || 0), 0);
    r.getCell(7).numFmt = "0.00";
    r.getCell(8).value = description;
    for (let c = 1; c <= 8; c++) {
      r.getCell(c).alignment = { vertical: "top", wrapText: c === 4 || c === 6 || c === 8 };
      r.getCell(c).border = { bottom: thin };
    }
    r.height = Math.max(15, 15 * Math.max(lineCount(l.address || "", 30), lineCount(crewText, 34), lineCount(description, 62)));
  });

  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = `TM-Invoice-${task?.taskNumber || "invoice"}-${invoice.periodStart}_${invoice.periodEnd}.xlsx`;
  return { filename, base64: buf.toString("base64") };
}
