"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunities, projects } from "@/lib/db/schema";

export type OpportunityFormState = { error?: string } | null;

export async function saveOpportunity(
  _prev: OpportunityFormState,
  formData: FormData
): Promise<OpportunityFormState> {
  const id = String(formData.get("id") || "");
  const jobName = String(formData.get("jobName") || "").trim();
  if (!jobName) return { error: "Job name is required." };

  const data = {
    kind: String(formData.get("kind") || "Opportunity"),
    oppType: String(formData.get("oppType") || "Bid Job"),
    jobName,
    estimator: String(formData.get("estimator") || ""),
    bidDueDate: String(formData.get("bidDueDate") || "") || null,
    customer: String(formData.get("customer") || "").trim() || null,
    location: String(formData.get("location") || "").trim() || null,
  };

  if (id) {
    await db.update(opportunities).set(data).where(eq(opportunities.id, id));
  } else {
    await db.insert(opportunities).values({ id: randomUUID(), ...data });
  }

  revalidatePath("/opportunities");
  return null;
}

export async function deleteOpportunity(id: string) {
  await db.delete(opportunities).where(eq(opportunities.id, id));
  revalidatePath("/opportunities");
}

export type StatusFormState = { error?: string } | null;

export async function updateBidStatus(
  _prev: StatusFormState,
  formData: FormData
): Promise<StatusFormState> {
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing opportunity id." };

  const bidValueRaw = formData.get("bidValue");
  const bidValue = bidValueRaw === "" || bidValueRaw === null ? null : Number(bidValueRaw);
  const bidStatus = String(formData.get("bidStatus") || "Open");

  const existing = await db.query.opportunities.findFirst({ where: eq(opportunities.id, id) });
  if (!existing) return { error: "That opportunity no longer exists." };

  const wasWon = existing.bidStatus === "Won";
  await db.update(opportunities).set({ bidValue: bidValue as never, bidStatus }).where(eq(opportunities.id, id));

  if (bidStatus === "Won" && !wasWon) {
    const [project] = await db
      .insert(projects)
      .values({
        id: randomUUID(),
        name: existing.jobName,
        location: existing.location,
        status: "upcoming",
        value: bidValue as never,
        crew: [],
      })
      .returning();
    await db.update(opportunities).set({ convertedProjectId: project.id }).where(eq(opportunities.id, id));
  }

  revalidatePath("/opportunities");
  revalidatePath("/board");
  return null;
}
