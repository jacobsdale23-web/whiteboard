"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bidItems } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { extractBidItemsFromPdf, splitPdfIntoChunks, type BidImportResult } from "@/lib/bid-import";
import { uploadObject, deleteObject, getUploadUrl, getObjectBuffer } from "@/lib/storage/s3";
import { BID_CATEGORIES } from "@/lib/estimate";

async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage estimates.");
  }
}

const FALLBACK_CATEGORY = BID_CATEGORIES[BID_CATEGORIES.length - 1]; // "Subcontractor / Other"

// Term-contract bid schedules can run well past 100 pages, so extraction
// is chunked at this many pages per Claude call -- keeps each call's
// Vercel execution window (and token usage) scoped to one chunk instead
// of the whole document.
const PAGES_PER_CHUNK = 20;

// Step 1: hand the browser a presigned PUT URL so the raw file goes
// straight to storage, bypassing Vercel's serverless function payload
// limit entirely (same pattern as plan-files-actions.ts).
export async function requestBidImportUpload(
  opportunityId: string,
  filename: string
): Promise<{ error?: string; uploadUrl?: string; storageKey?: string }> {
  await requireAdmin();
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return { error: "Only PDF files are accepted." };
  }

  const storageKey = `opportunities/${opportunityId}/bid-import/${randomUUID()}-${filename}`;
  const uploadUrl = await getUploadUrl(storageKey, "application/pdf");
  return { uploadUrl, storageKey };
}

// Step 2: once the raw file is in storage, split it into page-range
// chunks and upload each chunk back to storage. This runs entirely
// server-side (no Claude calls), so it comfortably fits in one
// invocation even for a 100+mb source file.
export async function splitBidImportFile(
  opportunityId: string,
  storageKey: string,
  filename: string
): Promise<{ error?: string; chunks?: { storageKey: string; filename: string }[] }> {
  await requireAdmin();

  try {
    const buffer = await getObjectBuffer(storageKey);
    const chunkBuffers = await splitPdfIntoChunks(buffer, PAGES_PER_CHUNK);

    const chunks = await Promise.all(
      chunkBuffers.map(async (chunkBuffer, i) => {
        const chunkKey = `opportunities/${opportunityId}/bid-import/${randomUUID()}-chunk-${i + 1}.pdf`;
        await uploadObject(chunkKey, chunkBuffer, "application/pdf");
        return { storageKey: chunkKey, filename: chunkBuffers.length > 1 ? `${filename} (part ${i + 1})` : filename };
      })
    );

    await deleteObject(storageKey).catch(() => {});
    return { chunks };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't split that PDF." };
  }
}

// Step 3: extract line items from exactly one chunk. The client calls
// this once per chunk (in parallel) so each chunk's Claude call gets its
// own Vercel execution window instead of sharing one request's timeout.
export async function extractBidImportChunk(
  chunkStorageKey: string,
  chunkFilename: string
): Promise<{ filename?: string; result?: BidImportResult; error?: string }> {
  await requireAdmin();

  try {
    const buffer = await getObjectBuffer(chunkStorageKey);
    const result = await extractBidItemsFromPdf({ filename: chunkFilename, buffer });
    return { filename: chunkFilename, result };
  } catch (e) {
    return { filename: chunkFilename, error: e instanceof Error ? e.message : "Extraction failed." };
  } finally {
    await deleteObject(chunkStorageKey).catch(() => {});
  }
}

// Step 4: insert the merged line items (assembled client-side from every
// successful chunk) into the bid.
export async function saveBidImportItems(
  opportunityId: string,
  items: BidImportResult["items"]
): Promise<{ error?: string; imported?: number }> {
  await requireAdmin();
  if (!items.length) return { error: "Couldn't find any bid line items in that file." };

  const existing = await db.select({ order: bidItems.order }).from(bidItems).where(eq(bidItems.opportunityId, opportunityId));
  let order = existing.length;
  for (const item of items) {
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
  return { imported: items.length };
}
