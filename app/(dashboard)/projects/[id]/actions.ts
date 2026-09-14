"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { milestones, dailyLogs } from "@/lib/db/schema";

// ---------- schedule (milestones) ----------

export async function addMilestone(projectId: string, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const date = String(formData.get("date") || "") || null;
  await db.insert(milestones).values({ id: randomUUID(), projectId, name, date, done: false, order: "0" });
  revalidatePath(`/projects/${projectId}`);
}

export async function toggleMilestone(projectId: string, id: string, done: boolean) {
  await db.update(milestones).set({ done }).where(eq(milestones.id, id));
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteMilestone(projectId: string, id: string) {
  await db.delete(milestones).where(eq(milestones.id, id));
  revalidatePath(`/projects/${projectId}`);
}

// ---------- daily logs ----------

export async function addLog(projectId: string, formData: FormData) {
  const date = String(formData.get("date") || "");
  const leakNumber = String(formData.get("leakNumber") || "").trim() || "N/A";
  const foreman = String(formData.get("foreman") || "").trim();
  const lineItem = String(formData.get("lineItem") || "").trim() || null;
  const description = String(formData.get("description") || "").trim();

  const names = formData.getAll("crewName");
  const positions = formData.getAll("crewPosition");
  const hours = formData.getAll("crewHours");
  const crewRows = names
    .map((n, i) => ({ name: String(n).trim(), position: String(positions[i] || ""), hours: Number(hours[i]) || 0 }))
    .filter((c) => c.name);

  if (!date || !foreman || !description) return;

  await db.insert(dailyLogs).values({
    id: randomUUID(),
    projectId,
    date,
    leakNumber,
    foreman,
    lineItem,
    crew: crewRows,
    description,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteLog(projectId: string, id: string) {
  await db.delete(dailyLogs).where(eq(dailyLogs.id, id));
  revalidatePath(`/projects/${projectId}`);
}
