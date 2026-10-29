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
import { warningKey } from "@/lib/tm-ack";
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

  // A log on this project in the period with no task number is never picked up by the invoice: say so,
  // so its hours can't be left off by accident.
  const untagged: StoredWarning[] = periodLogs
    .filter((l) => l.projectId === projectId && !l.taskNumber)
    .map((l) => ({
      severity: "error" as const,
      type: "missing_data" as const,
      date: l.date,
      crewMember: "",
      message: `The daily log dated ${l.date} has no task number, so none of its hours are on this invoice. If it belongs to task ${taskNumber}, set its task number and regenerate.`,
    }));

  return [...untagged, ...validateLineItems(items), ...findCrossCrewOverlaps(items, projectId, otherLogs), ...quality];
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

// Why a task/period has nothing to bill, in words that say what to fix.
function noHoursMessage(logs: (typeof dailyLogs.$inferSelect)[], taskNumber: string, periodStart: string, periodEnd: string): string {
  const inPeriod = logs.filter((l) => l.date >= periodStart && l.date <= periodEnd);
  const untagged = inPeriod.filter((l) => !l.taskNumber).map((l) => l.date).sort();
  const other = Array.from(new Set(inPeriod.filter((l) => l.taskNumber && l.taskNumber !== taskNumber).map((l) => l.taskNumber as string)));
  let why = `No daily log hours found for task ${taskNumber} from ${periodStart} to ${periodEnd}.`;
  if (untagged.length) why += ` ${untagged.length === 1 ? "The log" : "These logs"} dated ${untagged.join(", ")} ${untagged.length === 1 ? "has" : "have"} no task number. Open ${untagged.length === 1 ? "it" : "each"} in Daily Logs (the pencil), set the task number to ${taskNumber}, then try again.`;
  else if (other.length) why += ` Logs in that period are under other task numbers: ${other.join(", ")}.`;
  else if (!inPeriod.length) why += " There are no daily logs on this project in that period.";
  return why;
}

// Rebuilds a draft's line items, total and flags from the current daily logs and rates, in place. Flags already
// marked "not a mistake" stay marked if the same flag comes back; ones that no longer apply are dropped.
async function refreshDraft(invoice: typeof tmInvoices.$inferSelect): Promise<{ error?: string }> {
  if (invoice.status !== "draft") return { error: "Only a draft can be refreshed. Delete the approved invoice first if it has to be redone." };
  const [task] = await db.select().from(billingTasks).where(eq(billingTasks.id, invoice.billingTaskId));
  if (!task) return { error: "That billing task no longer exists." };

  const [logs, rates] = await Promise.all([
    db.select().from(dailyLogs).where(eq(dailyLogs.projectId, invoice.projectId)),
    db.select().from(billingRates).where(eq(billingRates.projectId, invoice.projectId)),
  ]);
  const lineItems = buildInvoiceLineItems(logs, rates, task.taskNumber, invoice.periodStart, invoice.periodEnd);
  if (!lineItems.length) return { error: noHoursMessage(logs, task.taskNumber, invoice.periodStart, invoice.periodEnd) };

  const total = sumLineItems(lineItems);
  const warnings = await computeWarnings(invoice.projectId, task.taskNumber, invoice.periodStart, invoice.periodEnd, lineItems);
  const stillFlagged = new Set(warnings.map(warningKey));
  const acknowledged = (invoice.acknowledged || []).filter((a) => stillFlagged.has(a.key));
  await db.update(tmInvoices).set({ lineItems, total: total as never, warnings, acknowledged }).where(eq(tmInvoices.id, invoice.id));
  return {};
}

export async function refreshInvoice(projectId: string, id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const [invoice] = await db
    .select()
    .from(tmInvoices)
    .where(and(eq(tmInvoices.id, id), eq(tmInvoices.projectId, projectId)));
  if (!invoice) return { error: "Invoice not found." };
  const res = await refreshDraft(invoice);
  revalidatePath(`/projects/${projectId}`);
  return res;
}

export async function acknowledgeWarning(projectId: string, invoiceId: string, key: string, note: string) {
  await requireAdmin();
  const [invoice] = await db
    .select()
    .from(tmInvoices)
    .where(and(eq(tmInvoices.id, invoiceId), eq(tmInvoices.projectId, projectId)));
  if (!invoice) return;
  const list = invoice.acknowledged || [];
  if (!list.some((a) => a.key === key)) {
    await db
      .update(tmInvoices)
      .set({ acknowledged: [...list, { key, note: note.trim().slice(0, 300), at: new Date().toISOString() }] })
      .where(eq(tmInvoices.id, invoiceId));
  }
  revalidatePath(`/projects/${projectId}`);
}

// Settles several flags at once ("Mark all like this").
export async function acknowledgeWarnings(projectId: string, invoiceId: string, keys: string[], note: string) {
  await requireAdmin();
  const [invoice] = await db
    .select()
    .from(tmInvoices)
    .where(and(eq(tmInvoices.id, invoiceId), eq(tmInvoices.projectId, projectId)));
  if (!invoice) return;
  const list = invoice.acknowledged || [];
  const have = new Set(list.map((a) => a.key));
  const at = new Date().toISOString();
  const added = Array.from(new Set(keys))
    .filter((k) => !have.has(k))
    .map((key) => ({ key, note: note.trim().slice(0, 300), at }));
  if (added.length) await db.update(tmInvoices).set({ acknowledged: [...list, ...added] }).where(eq(tmInvoices.id, invoiceId));
  revalidatePath(`/projects/${projectId}`);
}

export async function unacknowledgeWarning(projectId: string, invoiceId: string, key: string) {
  await requireAdmin();
  const [invoice] = await db
    .select()
    .from(tmInvoices)
    .where(and(eq(tmInvoices.id, invoiceId), eq(tmInvoices.projectId, projectId)));
  if (!invoice) return;
  await db
    .update(tmInvoices)
    .set({ acknowledged: (invoice.acknowledged || []).filter((a) => a.key !== key) })
    .where(eq(tmInvoices.id, invoiceId));
  revalidatePath(`/projects/${projectId}`);
}

export async function generateInvoice(
  projectId: string,
  billingTaskId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ id: string; refreshed?: boolean } | { error: string }> {
  await requireAdmin();
  // Expected problems come back as a result, not a throw: a thrown message is hidden in production and the
  // person billing only sees an error code.
  if (!periodStart || !periodEnd) return { error: "Pick a start and end date for the billing period." };

  const [task] = await db.select().from(billingTasks).where(eq(billingTasks.id, billingTaskId));
  if (!task) return { error: "That billing task no longer exists." };

  // Never make a second copy of an invoice: the same period refreshes the existing draft, and any other
  // overlap would bill the same hours twice.
  const existing = await db
    .select()
    .from(tmInvoices)
    .where(and(eq(tmInvoices.projectId, projectId), eq(tmInvoices.billingTaskId, billingTaskId)));
  const overlapping = existing.filter((e) => e.periodStart <= periodEnd && periodStart <= e.periodEnd);
  const sameDraft = overlapping.find((e) => e.status === "draft" && e.periodStart === periodStart && e.periodEnd === periodEnd);
  if (sameDraft) {
    const res = await refreshDraft(sameDraft);
    revalidatePath(`/projects/${projectId}`);
    return res.error ? { error: res.error } : { id: sameDraft.id, refreshed: true };
  }
  if (overlapping.length) {
    const o = overlapping[0];
    return {
      error: `This task already has ${o.status === "approved" ? "an approved" : "a draft"} invoice for ${o.periodStart} to ${o.periodEnd}, which overlaps those dates, so the same hours would be billed twice. ${
        o.status === "draft" ? "Open that draft and use Refresh from daily logs" : "Delete it first if it has to be redone"
      }, or pick dates that don't overlap.`,
    };
  }

  const [logs, rates] = await Promise.all([
    db.select().from(dailyLogs).where(eq(dailyLogs.projectId, projectId)),
    db.select().from(billingRates).where(eq(billingRates.projectId, projectId)),
  ]);

  const lineItems = buildInvoiceLineItems(logs, rates, task.taskNumber, periodStart, periodEnd);
  if (!lineItems.length) return { error: noHoursMessage(logs, task.taskNumber, periodStart, periodEnd) };
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
  return { id: invoice.id };
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

// An invoice can only be approved once every flag on it has been fixed or marked "not a mistake".
export async function approveInvoice(projectId: string, id: string): Promise<{ error?: string }> {
  await requireAdmin();
  const [invoice] = await db
    .select()
    .from(tmInvoices)
    .where(and(eq(tmInvoices.id, id), eq(tmInvoices.projectId, projectId)));
  if (!invoice) return { error: "Invoice not found." };

  const warnings = await rescreen(invoice);
  const acknowledged = new Set((invoice.acknowledged || []).map((a) => a.key));
  const open = warnings.filter((w) => !acknowledged.has(warningKey(w)));
  if (open.length) {
    revalidatePath(`/projects/${projectId}`);
    return { error: `${open.length} flagged item${open.length === 1 ? "" : "s"} still need${open.length === 1 ? "s" : ""} to be fixed in the daily logs (then Refresh from daily logs) or marked "Not a mistake" before this can be approved.` };
  }

  await db
    .update(tmInvoices)
    .set({ status: "approved", approvedAt: new Date() })
    .where(and(eq(tmInvoices.id, id), eq(tmInvoices.projectId, projectId)));
  revalidatePath(`/projects/${projectId}`);
  return {};
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
  const acknowledged = new Set((invoice.acknowledged || []).map((a) => a.key));
  // Flags marked "not a mistake" are settled, so they don't show on the file.
  const warnings = (await rescreen(invoice)).filter((w) => !acknowledged.has(warningKey(w)));
  const touches =(w: (typeof warnings)[number], li: { crewMember: string; date: string }) =>
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
