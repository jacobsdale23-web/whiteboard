"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payApps, sovItems, sovEntries, lineItems, dailyLogs } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireProject } from "@/lib/auth/company";
import { parsePayAppWorkbook, type ParsedPayApp } from "@/lib/xlsx-payapp";
import { byItemNo, compileProduction, overlappingApps, type LogQuantity } from "@/lib/production";

async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage budget data.");
  }
}

export async function parsePayAppFile(file: File): Promise<ParsedPayApp | { error: string }> {
  await requireAdmin();
  try {
    const buf = await file.arrayBuffer();
    return parsePayAppWorkbook(buf);
  } catch {
    return { error: "Couldn't read that file — it may not be a valid Excel workbook." };
  }
}

export type SovRowInput = {
  itemNo: string;
  description: string;
  unit?: string;
  bidQty: number;
  unitPrice: number;
  periodQty: number;
  stored: number;
  baselineQty: number;
};

function lineItemDocId(projectId: string, itemNo: string) {
  return (projectId + "-" + itemNo).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function savePayApp(
  projectId: string,
  // logFrom/logTo: the daily-log dates the quantities were compiled from (so those logs aren't billed twice).
  header: { appNumber: string; period: string; applicationDate: string | null; retainagePercent: number; logFrom?: string | null; logTo?: string | null },
  rows: SovRowInput[]
) {
  await requireAdmin();
  const cleanRows = rows.filter((r) => r.itemNo.trim());
  if (!header.appNumber.trim() || !cleanRows.length) {
    throw new Error("Add an application number and at least one line item.");
  }
  const fromLogs = isDate(header.logFrom) && isDate(header.logTo) && header.logFrom <= header.logTo;

  const [payApp] = await db
    .insert(payApps)
    .values({
      id: randomUUID(),
      projectId,
      appNumber: header.appNumber.trim(),
      period: header.period.trim() || null,
      applicationDate: header.applicationDate,
      retainagePercent: header.retainagePercent as never,
      logFrom: fromLogs ? header.logFrom : null,
      logTo: fromLogs ? header.logTo : null,
    })
    .returning();

  const existingItems = await db.select().from(sovItems).where(eq(sovItems.projectId, projectId));

  for (const row of cleanRows) {
    let item = existingItems.find((x) => x.itemNo === row.itemNo);
    const unit = row.unit?.trim() || null;
    if (item) {
      await db
        .update(sovItems)
        .set({ description: row.description, bidQty: row.bidQty as never, unitPrice: row.unitPrice as never, ...(unit ? { unit } : {}) })
        .where(eq(sovItems.id, item.id));
    } else {
      const [created] = await db
        .insert(sovItems)
        .values({
          id: randomUUID(),
          projectId,
          itemNo: row.itemNo,
          description: row.description,
          unit,
          bidQty: row.bidQty as never,
          unitPrice: row.unitPrice as never,
          baselineQty: row.baselineQty as never,
          order: String(existingItems.length),
        })
        .returning();
      existingItems.push(created);
      item = created;
    }

    await db.insert(sovEntries).values({
      id: randomUUID(),
      projectId,
      payAppId: payApp.id,
      itemNo: row.itemNo,
      periodQty: row.periodQty as never,
      stored: row.stored as never,
    });

    // keep the public, price-free line item catalog in sync for Daily Logs
    await db
      .insert(lineItems)
      .values({
        id: lineItemDocId(projectId, row.itemNo),
        projectId,
        itemNo: row.itemNo,
        description: row.description,
        unit,
        order: item.order,
      })
      .onConflictDoUpdate({
        target: lineItems.id,
        set: { description: row.description, ...(unit ? { unit } : {}) },
      });
  }

  revalidatePath(`/projects/${projectId}`);
}

// Sets up (or fixes) a job's line items without a pay application: description, unit of measure, bid quantity and
// price. Foremen pick from the price-free copy (line_items) when they log what they installed. Existing items are
// updated in place and never deleted, since pay applications refer to them.
export async function saveSovItems(projectId: string, rows: SovRowInput[]): Promise<{ error?: string; saved?: number }> {
  await requireAdmin();
  await requireProject(projectId);
  const clean = rows.map((r) => ({ ...r, itemNo: String(r.itemNo || "").trim() })).filter((r) => r.itemNo);
  if (!clean.length) return { error: "Add at least one line item." };
  const seen = new Set<string>();
  for (const r of clean) {
    if (seen.has(r.itemNo)) return { error: `Line item ${r.itemNo} is listed twice.` };
    seen.add(r.itemNo);
  }

  const existing = await db.select().from(sovItems).where(eq(sovItems.projectId, projectId));
  let order = existing.length;
  for (const r of clean) {
    const unit = r.unit?.trim() || null;
    const description = String(r.description || "").trim();
    const bidQty = Number(r.bidQty) || 0;
    const unitPrice = Number(r.unitPrice) || 0;
    const item = existing.find((x) => x.itemNo === r.itemNo);
    if (item) {
      await db.update(sovItems).set({ description, unit, bidQty: bidQty as never, unitPrice: unitPrice as never }).where(eq(sovItems.id, item.id));
    } else {
      await db.insert(sovItems).values({ id: randomUUID(), projectId, itemNo: r.itemNo, description, unit, bidQty: bidQty as never, unitPrice: unitPrice as never, baselineQty: "0" as never, order: String(order++) });
    }
    const orderValue = item ? item.order : String(order - 1);
    await db
      .insert(lineItems)
      .values({ id: lineItemDocId(projectId, r.itemNo), projectId, itemNo: r.itemNo, description, unit, order: orderValue })
      .onConflictDoUpdate({ target: lineItems.id, set: { description, unit } });
  }
  revalidatePath(`/projects/${projectId}`);
  return { saved: clean.length };
}

export type ProductionDraftRow = {
  itemNo: string;
  description: string;
  unit: string | null;
  qty: number;
  days: { date: string; qty: number }[];
  prevQty: number;
  bidQty: number;
  inSov: boolean;
};
export type ProductionDraft = {
  error?: string;
  rows: ProductionDraftRow[];
  logCount: number;
  dayCount: number;
  warnings: string[];
  suggestedAppNumber: string;
  retainagePercent: number;
};

// Compiles what the foremen logged between two dates into per-line-item quantities, next to what earlier pay
// applications already billed, and flags anything that needs a look before it becomes a pay application.
export async function getProductionDraft(projectId: string, from: string, to: string): Promise<ProductionDraft> {
  const empty = { rows: [], logCount: 0, dayCount: 0, warnings: [], suggestedAppNumber: "1", retainagePercent: 5 };
  await requireAdmin();
  await requireProject(projectId);
  if (!isDate(from) || !isDate(to) || from > to) return { ...empty, error: "Pick a start date and an end date, with the start first." };

  const [logs, items, apps, entries] = await Promise.all([
    db.select({ id: dailyLogs.id, date: dailyLogs.date, quantities: dailyLogs.quantities }).from(dailyLogs).where(eq(dailyLogs.projectId, projectId)),
    db.select().from(sovItems).where(eq(sovItems.projectId, projectId)),
    db.select().from(payApps).where(eq(payApps.projectId, projectId)),
    db.select().from(sovEntries).where(eq(sovEntries.projectId, projectId)),
  ]);

  const compiled = compileProduction(logs as { id: string; date: string; quantities: LogQuantity[] }[], from, to);
  const nums = apps.map((a) => Number(a.appNumber)).filter((n) => Number.isFinite(n));
  const latest = apps.slice().sort((a, b) => Number(a.appNumber) - Number(b.appNumber)).pop();
  const warnings: string[] = [];

  for (const a of overlappingApps(apps, from, to)) {
    warnings.push(`Pay Application #${a.appNumber} already used daily logs from ${a.logFrom} to ${a.logTo}, which overlaps these dates. Billing them again would double-bill that work.`);
  }

  const rows: ProductionDraftRow[] = [];
  for (const r of compiled.rows) {
    const item = items.find((x) => x.itemNo === r.itemNo);
    if (!item) {
      warnings.push(`Line item ${r.itemNo} was logged (${r.qty}) but isn't in this job's schedule of values, so it can't go on the pay application.`);
      rows.push({ itemNo: r.itemNo, description: "(not in the schedule of values)", unit: null, qty: r.qty, days: r.days, prevQty: 0, bidQty: 0, inSov: false });
      continue;
    }
    const prevQty = (Number(item.baselineQty) || 0) + entries.filter((e) => e.itemNo === r.itemNo).reduce((n, e) => n + (Number(e.periodQty) || 0), 0);
    const bidQty = Number(item.bidQty) || 0;
    if (bidQty > 0 && prevQty + r.qty > bidQty + 1e-9) {
      warnings.push(`Item ${r.itemNo} would reach ${prevQty + r.qty} against a bid quantity of ${bidQty}. Check the quantities the foremen entered.`);
    }
    rows.push({ itemNo: r.itemNo, description: item.description || "", unit: item.unit, qty: r.qty, days: r.days, prevQty, bidQty, inSov: true });
  }
  rows.sort((a, b) => byItemNo(a.itemNo, b.itemNo));

  return {
    rows,
    logCount: compiled.logCount,
    dayCount: compiled.dayCount,
    warnings,
    suggestedAppNumber: String((nums.length ? Math.max(...nums) : 0) + 1),
    retainagePercent: latest ? Number(latest.retainagePercent) || 5 : 5,
  };
}

export async function deletePayApp(projectId: string, id: string) {
  await requireAdmin();
  await db.delete(sovEntries).where(eq(sovEntries.payAppId, id));
  await db.delete(payApps).where(eq(payApps.id, id));
  revalidatePath(`/projects/${projectId}`);
}
