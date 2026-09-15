"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { planFiles, planReviews } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { getObjectBuffer } from "@/lib/storage/s3";
import { reviewPlanDocuments } from "@/lib/plan-review";

async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage estimates.");
  }
}

export async function runPlanReview(opportunityId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const files = await db.select().from(planFiles).where(eq(planFiles.opportunityId, opportunityId));
  if (!files.length) return { error: "Upload at least one plan/spec PDF first." };

  try {
    const buffers = await Promise.all(
      files.map(async (f) => ({ filename: f.filename, buffer: await getObjectBuffer(f.storageKey) }))
    );
    const result = await reviewPlanDocuments(buffers);

    await db.insert(planReviews).values({
      id: randomUUID(),
      opportunityId,
      summary: result.summary,
      findings: result.findings,
    });
    revalidatePath(`/opportunities/${opportunityId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "AI review failed." };
  }
}

export async function deletePlanReview(opportunityId: string, id: string) {
  await requireAdmin();
  await db.delete(planReviews).where(and(eq(planReviews.id, id), eq(planReviews.opportunityId, opportunityId)));
  revalidatePath(`/opportunities/${opportunityId}`);
}
