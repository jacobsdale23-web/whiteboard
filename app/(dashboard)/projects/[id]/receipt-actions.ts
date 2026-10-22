"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, lineItems, receipts } from "@/lib/db/schema";
import { getSessionAndProfile, isSafetyViewer } from "@/lib/auth/current-user";
import { canAccessCompany, canOpenProject } from "@/lib/auth/company";
import { deleteObject, getDownloadUrl, getObjectBuffer, getUploadUrl } from "@/lib/storage/s3";
import { scanReceiptImage } from "@/lib/receipt-scan";
import { TM_RECEIPT_CATEGORIES } from "@/lib/receipt-categories";

const TM_CATEGORIES = TM_RECEIPT_CATEGORIES;

const TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
};

// Any signed-in user (foremen included) can submit a receipt; only admins can
// open the photos or delete receipts, from the Budget section.
async function requireUser() {
  const current = await getSessionAndProfile();
  if (current && isSafetyViewer(current.profile)) return null;
  return current;
}

// The photo goes phone -> storage on a presigned URL, so a big photo never
// has to squeeze through a serverless function.
export async function requestReceiptUpload(
  projectId: string,
  contentType: string
): Promise<{ error?: string; uploadUrl?: string; storageKey?: string }> {
  if (!(await requireUser())) return { error: "Please sign in again." };
  if (!(await canOpenProject(projectId))) return { error: "Project not found." };
  if (!TYPES[contentType]) return { error: "Please use a JPG or PNG photo." };
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const storageKey = `receipts/${projectId}/${randomUUID()}.${ext}`;
  return { uploadUrl: await getUploadUrl(storageKey, contentType), storageKey };
}

// Reads vendor / total / date off the uploaded photo. A failure here is not
// fatal: the foreman can still fill the details in by hand.
export async function scanReceipt(
  projectId: string,
  storageKey: string
): Promise<{ error?: string; vendor?: string | null; total?: number | null; date?: string | null }> {
  if (!(await requireUser())) return { error: "Please sign in again." };
  if (!(await canOpenProject(projectId))) return { error: "Project not found." };
  if (!storageKey.startsWith(`receipts/${projectId}/`)) return { error: "Invalid photo." };
  const ext = storageKey.split(".").pop() || "jpg";
  const mediaType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  try {
    const buffer = await getObjectBuffer(storageKey);
    return await scanReceiptImage(buffer, mediaType);
  } catch (e) {
    console.error("scanReceipt failed", e);
    return { error: "Couldn't read this receipt automatically." };
  }
}

export async function saveReceipt(
  projectId: string,
  data: {
    storageKey: string;
    vendor: string;
    amount: number;
    date: string;
    category: string;
    lineItem: string;
    note: string;
    aiVendor: string | null;
    aiAmount: number | null;
  }
): Promise<{ error?: string }> {
  const current = await requireUser();
  if (!current) return { error: "Please sign in again." };
  if (!data.storageKey.startsWith(`receipts/${projectId}/`)) return { error: "Invalid photo." };
  if (!Number.isFinite(data.amount) || data.amount <= 0) return { error: "Enter the receipt total." };

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project || !(await canAccessCompany(project.companyId))) return { error: "Project not found." };

  let category: string | null = null;
  let lineItem: string | null = null;
  if (project.billingType === "tm") {
    if (!TM_CATEGORIES.includes(data.category)) return { error: "Pick a category: Fuel, Food, Materials, or Equipment." };
    category = data.category;
  } else if (data.lineItem) {
    const found = await db
      .select()
      .from(lineItems)
      .where(and(eq(lineItems.projectId, projectId), eq(lineItems.itemNo, data.lineItem)));
    if (!found.length) return { error: "That line item doesn't exist on this job." };
    lineItem = data.lineItem;
  }

  await db.insert(receipts).values({
    id: randomUUID(),
    projectId,
    date: data.date || new Date().toISOString().slice(0, 10),
    vendor: data.vendor.trim() || null,
    amount: data.amount.toFixed(2) as never,
    category,
    lineItem,
    note: data.note.trim() || null,
    storageKey: data.storageKey,
    aiVendor: data.aiVendor,
    aiAmount: data.aiAmount === null ? null : (data.aiAmount.toFixed(2) as never),
    submittedBy: current.profile.name,
    submittedById: current.profile.id,
  });
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// The foreman backed out after the photo was uploaded: remove the orphan file.
export async function discardReceiptUpload(projectId: string, storageKey: string): Promise<void> {
  if (!(await requireUser())) return;
  if (!storageKey.startsWith(`receipts/${projectId}/`)) return;
  const saved = await db.select().from(receipts).where(eq(receipts.storageKey, storageKey));
  if (!saved.length) await deleteObject(storageKey);
}

async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") return null;
  return current;
}

export async function getReceiptUrl(id: string): Promise<{ error?: string; url?: string }> {
  if (!(await requireAdmin())) return { error: "Only admins can view receipts." };
  const r = await db.query.receipts.findFirst({ where: eq(receipts.id, id) });
  if (!r || !(await canOpenProject(r.projectId))) return { error: "Receipt not found." };
  return { url: await getDownloadUrl(r.storageKey) };
}

export async function deleteReceipt(projectId: string, id: string): Promise<{ error?: string }> {
  if (!(await requireAdmin())) return { error: "Only admins can delete receipts." };
  const r = await db.query.receipts.findFirst({ where: and(eq(receipts.id, id), eq(receipts.projectId, projectId)) });
  if (!r || !(await canOpenProject(r.projectId))) return {};
  await deleteObject(r.storageKey);
  await db.delete(receipts).where(eq(receipts.id, id));
  revalidatePath(`/projects/${projectId}`);
  return {};
}
