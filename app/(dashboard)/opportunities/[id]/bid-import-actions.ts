"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bidItems } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { extractBidItemsFromPdf } from "@/lib/bid-import";
import { BID_CATEGORIES } from "@/lib/estimate";

async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage estimates.");
  }
}

const FALLBACK_CATEGORY = BID_CATEGORIES[BID_CATEGORIES.length - 1]; // "Subcontractor / Other"

export async function importBidItemsFromPdf(opportunityId: string, formData: FormData): Promise<{ error?: string; imported?: number; notes?: string }> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a PDF file first." };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Only PDF files are accepted." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractBidItemsFromPdf([{ filename: file.name, buffer }]);
    if (!result.items.length) {
      return { error: "Couldn't find any bid line items in that file." };
    }

    const existing = await db.select({ order: bidItems.order }).from(bidItems).where(eq(bidItems.opportunityId, opportunityId));
    let order = existing.length;
    for (const item of result.items) {
      await db.insert(bidItems).values({
        id: randomUUID(),
        opportunityId,
        itemNo: item.itemNo,
        category: item.category || FALLBACK_CATEGORY,
        description: item.description,
        qty: item.qty as never,
        unit: item.unit,
        unitPrice: "0" as never,
        order: String(order++),
      });
    }

    revalidatePath(`/opportunities/${opportunityId}`);
    return { imported: result.items.length, notes: result.notes || undefined };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Import failed." };
  }
}
