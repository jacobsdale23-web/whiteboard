"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { planFiles } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { deleteObject, getDownloadUrl, getUploadUrl } from "@/lib/storage/s3";

async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage estimates.");
  }
}

// Plan/spec PDFs (full drawing sets) routinely exceed Vercel's serverless
// function payload limit, so the file bytes go browser -> storage directly
// via a presigned URL. This just hands out that URL plus the DB row's future id/key.
export async function requestPlanFileUpload(
  opportunityId: string,
  filename: string
): Promise<{ error?: string; uploadUrl?: string; id?: string; storageKey?: string }> {
  await requireAdmin();
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return { error: "Only PDF files are accepted." };
  }

  const id = randomUUID();
  const storageKey = `opportunities/${opportunityId}/${id}-${filename}`;
  const uploadUrl = await getUploadUrl(storageKey, "application/pdf");
  return { uploadUrl, id, storageKey };
}

export async function confirmPlanFileUpload(
  opportunityId: string,
  file: { id: string; filename: string; storageKey: string; fileSize: number }
): Promise<{ error?: string }> {
  await requireAdmin();
  await db.insert(planFiles).values({
    id: file.id,
    opportunityId,
    filename: file.filename,
    storageKey: file.storageKey,
    fileSize: file.fileSize as never,
  });

  revalidatePath(`/opportunities/${opportunityId}`);
  return {};
}

export async function deletePlanFile(opportunityId: string, id: string) {
  await requireAdmin();
  const [file] = await db.select().from(planFiles).where(and(eq(planFiles.id, id), eq(planFiles.opportunityId, opportunityId)));
  if (!file) return;
  await deleteObject(file.storageKey);
  await db.delete(planFiles).where(eq(planFiles.id, id));
  revalidatePath(`/opportunities/${opportunityId}`);
}

export async function getPlanFileDownloadUrl(opportunityId: string, id: string): Promise<string> {
  await requireAdmin();
  const [file] = await db.select().from(planFiles).where(and(eq(planFiles.id, id), eq(planFiles.opportunityId, opportunityId)));
  if (!file) throw new Error("File not found.");
  return getDownloadUrl(file.storageKey);
}
