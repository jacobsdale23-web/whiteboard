"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payApps, sovItems, sovEntries, lineItems } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { parsePayAppWorkbook, type ParsedPayApp } from "@/lib/xlsx-payapp";

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
  bidQty: number;
  unitPrice: number;
  periodQty: number;
  stored: number;
  baselineQty: number;
};

function lineItemDocId(projectId: string, itemNo: string) {
  return (projectId + "-" + itemNo).trim().toLowerCase().replace(/[^a-z0-9._-]/g, "_");
}

export async function savePayApp(
  projectId: string,
  header: { appNumber: string; period: string; applicationDate: string | null; retainagePercent: number },
  rows: SovRowInput[]
) {
  await requireAdmin();
  const cleanRows = rows.filter((r) => r.itemNo.trim());
  if (!header.appNumber.trim() || !cleanRows.length) {
    throw new Error("Add an application number and at least one line item.");
  }

  const [payApp] = await db
    .insert(payApps)
    .values({
      id: randomUUID(),
      projectId,
      appNumber: header.appNumber.trim(),
      period: header.period.trim() || null,
      applicationDate: header.applicationDate,
      retainagePercent: header.retainagePercent as never,
    })
    .returning();

  const existingItems = await db.select().from(sovItems).where(eq(sovItems.projectId, projectId));

  for (const row of cleanRows) {
    let item = existingItems.find((x) => x.itemNo === row.itemNo);
    if (item) {
      await db
        .update(sovItems)
        .set({ description: row.description, bidQty: row.bidQty as never, unitPrice: row.unitPrice as never })
        .where(eq(sovItems.id, item.id));
    } else {
      const [created] = await db
        .insert(sovItems)
        .values({
          id: randomUUID(),
          projectId,
          itemNo: row.itemNo,
          description: row.description,
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
        order: item.order,
      })
      .onConflictDoUpdate({
        target: lineItems.id,
        set: { description: row.description },
      });
  }

  revalidatePath(`/projects/${projectId}`);
}

export async function deletePayApp(projectId: string, id: string) {
  await requireAdmin();
  await db.delete(sovEntries).where(eq(sovEntries.payAppId, id));
  await db.delete(payApps).where(eq(payApps.id, id));
  revalidatePath(`/projects/${projectId}`);
}
