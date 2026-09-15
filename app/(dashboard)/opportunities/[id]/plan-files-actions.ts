"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { planFiles } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { uploadObject, deleteObject, getDownloadUrl } from "@/lib/storage/s3";

async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage estimates.");
  }
}

export async function uploadPlanFile(opportunityId: string, formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a PDF file first." };
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { error: "Only PDF files are accepted." };
  }

  const id = randomUUID();
  const storageKey = `opportunities/${opportunityId}/${id}-${file.name}`;
  const buf = Buffer.from(await file.arrayBuffer());

  await uploadObject(storageKey, buf, "application/pdf");
  await db.insert(planFiles).values({
    id,
    opportunityId,
    filename: file.name,
    storageKey,
    fileSize: buf.length as never,
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
