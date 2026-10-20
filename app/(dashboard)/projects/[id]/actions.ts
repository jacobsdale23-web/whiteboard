"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { milestones, dailyLogs, leakNumbers, billingTasks } from "@/lib/db/schema";
import { rememberNames, recordCrewUse } from "@/lib/people";
import { getSessionAndProfile } from "@/lib/auth/current-user";

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

const NEW_OPTION = "__new__";

// A dropdown value, or the typed-in value when "Add new…" was chosen.
function pickedValue(formData: FormData, name: string): string {
  const v = String(formData.get(name) || "").trim();
  return v === NEW_OPTION ? String(formData.get(`${name}New`) || "").trim() : v;
}

// Reads and validates the log form (shared by add and edit), tidies typed
// names to match known people, and saves any new leak / task numbers.
async function prepareLog(projectId: string, formData: FormData) {
  const date = String(formData.get("date") || "");
  const leakNumber = pickedValue(formData, "leakNumber") || "N/A";
  const foreman = String(formData.get("foreman") || "").trim();
  const lineItem = String(formData.get("lineItem") || "").trim() || null;
  const description = String(formData.get("description") || "").trim();
  const address = String(formData.get("address") || "").trim() || null;
  const taskNumber = pickedValue(formData, "taskNumber") || null;
  const locusviewNumber = String(formData.get("locusviewNumber") || "").trim() || null;

  const names = formData.getAll("crewName");
  const positions = formData.getAll("crewPosition");
  const hours = formData.getAll("crewHours");
  const crewRows = names
    .map((n, i) => ({ name: String(n).trim(), position: String(positions[i] || ""), hours: Number(hours[i]) || 0 }))
    .filter((c) => c.name);

  if (!date || !foreman || !description) return null;

  // Match typed names to known people (fixes capitalization) and save new hires.
  const resolved = await rememberNames([foreman, ...crewRows.map((c) => c.name)]);
  const foremanName = resolved.get(foreman) || foreman;
  const crewFinal = crewRows.map((c) => ({ ...c, name: resolved.get(c.name) || c.name }));

  if (leakNumber !== "N/A") {
    const known = await db.select().from(leakNumbers).where(and(eq(leakNumbers.projectId, projectId), eq(leakNumbers.leakNumber, leakNumber)));
    if (!known.length) await db.insert(leakNumbers).values({ id: randomUUID(), projectId, leakNumber, address });
  }
  if (taskNumber) {
    const known = await db.select().from(billingTasks).where(and(eq(billingTasks.projectId, projectId), eq(billingTasks.taskNumber, taskNumber)));
    if (!known.length) await db.insert(billingTasks).values({ id: randomUUID(), projectId, taskNumber });
  }

  return { date, leakNumber, foreman: foremanName, lineItem, crew: crewFinal, description, address, taskNumber, locusviewNumber };
}

export async function addLog(projectId: string, formData: FormData) {
  const values = await prepareLog(projectId, formData);
  if (!values) return;
  await recordCrewUse(values.foreman, values.crew.map((c) => c.name), values.date);
  await db.insert(dailyLogs).values({ id: randomUUID(), projectId, ...values });
  revalidatePath(`/projects/${projectId}`);
}

// Fix a mistake after submitting. The log is marked as edited (who and when);
// weekly T&M invoices that were already generated are frozen snapshots and are
// not changed by this.
export async function updateLog(projectId: string, logId: string, formData: FormData): Promise<{ error?: string }> {
  const current = await getSessionAndProfile();
  if (!current) return { error: "Please sign in again." };
  const existing = await db.query.dailyLogs.findFirst({ where: and(eq(dailyLogs.id, logId), eq(dailyLogs.projectId, projectId)) });
  if (!existing) return { error: "That log no longer exists." };

  const values = await prepareLog(projectId, formData);
  if (!values) return { error: "Date, foreman and a description of the work are required." };

  await db
    .update(dailyLogs)
    .set({ ...values, editedAt: new Date(), editedBy: current.profile.name })
    .where(eq(dailyLogs.id, logId));
  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function deleteLog(projectId: string, id: string) {
  await db.delete(dailyLogs).where(eq(dailyLogs.id, id));
  revalidatePath(`/projects/${projectId}`);
}
