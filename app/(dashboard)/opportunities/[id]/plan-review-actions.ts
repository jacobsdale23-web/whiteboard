"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { planFiles, planReviews } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { getObjectBuffer } from "@/lib/storage/s3";
import { reviewSinglePlanDocument, type PlanReviewResult } from "@/lib/plan-review";

async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage estimates.");
  }
}

// Reviews exactly one plan file per call. The client calls this once per
// uploaded file (in parallel) so each file's Claude call runs in its own
// server action invocation, with its own Vercel execution time budget,
// rather than all files sharing one request's timeout.
export async function reviewSinglePlanFile(opportunityId: string, fileId: string): Promise<{ filename?: string; result?: PlanReviewResult; error?: string }> {
  await requireAdmin();
  const [file] = await db.select().from(planFiles).where(and(eq(planFiles.id, fileId), eq(planFiles.opportunityId, opportunityId)));
  if (!file) return { error: "File not found." };

  try {
    const buffer = await getObjectBuffer(file.storageKey);
    const result = await reviewSinglePlanDocument({ filename: file.filename, buffer });
    return { filename: file.filename, result };
  } catch (e) {
    return { filename: file.filename, error: e instanceof Error ? e.message : "Review failed." };
  }
}

export async function savePlanReview(
  opportunityId: string,
  data: { summary: string; findings: PlanReviewResult["findings"] }
): Promise<{ error?: string }> {
  await requireAdmin();
  await db.insert(planReviews).values({
    id: randomUUID(),
    opportunityId,
    summary: data.summary,
    findings: data.findings,
  });
  revalidatePath(`/opportunities/${opportunityId}`);
  return {};
}

export async function deletePlanReview(opportunityId: string, id: string) {
  await requireAdmin();
  await db.delete(planReviews).where(and(eq(planReviews.id, id), eq(planReviews.opportunityId, opportunityId)));
  revalidatePath(`/opportunities/${opportunityId}`);
}
