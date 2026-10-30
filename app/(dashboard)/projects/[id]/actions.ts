"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { milestones, dailyLogs, leakNumbers, billingTasks, lineItems } from "@/lib/db/schema";
import { rememberNames, recordCrewUse } from "@/lib/people";
import { cleanQuantities, type LogQuantity } from "@/lib/production";
import { getSessionAndProfile, isSafetyViewer, assertNotSafety } from "@/lib/auth/current-user";
import { requireProject } from "@/lib/auth/company";

// ---------- schedule (milestones) ----------

export async function addMilestone(projectId: string, formData: FormData) {
  await assertNotSafety();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const date = String(formData.get("date") || "") || null;
  await db.insert(milestones).values({ id: randomUUID(), projectId, name, date, done: false, order: "0" });
  revalidatePath(`/projects/${projectId}`);
}

export async function toggleMilestone(projectId: string, id: string, done: boolean) {
  await assertNotSafety();
  await db.update(milestones).set({ done }).where(eq(milestones.id, id));
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteMilestone(projectId: string, id: string) {
  await assertNotSafety();
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
// `already` is the production already on the log being edited, so an item that
// has since left the job's list can still be kept.
async function prepareLog(project: { id: string; companyId: string; billingType: string }, formData: FormData, already: LogQuantity[] = []) {
  const companyId = project.companyId;
  const projectId = project.id;
  const date = String(formData.get("date") || "");
  const leakNumber = pickedValue(formData, "leakNumber") || "N/A";
  const foreman = String(formData.get("foreman") || "").trim();
  const lineItem = String(formData.get("lineItem") || "").trim() || null;
  const description = String(formData.get("description") || "").trim();
  const address = String(formData.get("address") || "").trim() || null;
  const taskNumber = pickedValue(formData, "taskNumber") || null;
  const locusviewNumber = String(formData.get("locusviewNumber") || "").trim() || null;
  const scopeChange = formData.get("scopeChange") === "on";

  const names = formData.getAll("crewName");
  const positions = formData.getAll("crewPosition");
  const hours = formData.getAll("crewHours");
  const crewRows = names
    .map((n, i) => ({ name: String(n).trim(), position: String(positions[i] || ""), hours: Number(hours[i]) || 0 }))
    .filter((c) => c.name);

  if (!date || !foreman || !description) return { error: "Date, foreman and a description of the work are required." };

  // Unit-price jobs: what was installed, by line item (T&M jobs have no quantities).
  let quantities: LogQuantity[] = [];
  if (project.billingType !== "tm") {
    const known = await db.select({ itemNo: lineItems.itemNo }).from(lineItems).where(eq(lineItems.projectId, projectId));
    const allowed = new Set([...known.map((k) => k.itemNo), ...already.map((q) => q.itemNo)]);
    const cleaned = cleanQuantities(formData.getAll("qtyItem"), formData.getAll("qtyValue"), allowed);
    if ("error" in cleaned) return { error: cleaned.error };
    quantities = cleaned.quantities;
  }

  // Match typed names to known people (fixes capitalization) and save new hires.
  const resolved = await rememberNames(companyId, [foreman, ...crewRows.map((c) => c.name)]);
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

  return { values: { date, leakNumber, foreman: foremanName, lineItem, quantities, scopeChange, crew: crewFinal, description, address, taskNumber, locusviewNumber } };
}

export async function addLog(projectId: string, formData: FormData): Promise<{ error?: string }> {
  await assertNotSafety();
  const project = await requireProject(projectId);
  const prepared = await prepareLog(project, formData);
  if ("error" in prepared) return { error: prepared.error };
  const { values } = prepared;
  await recordCrewUse(project.companyId, values.foreman, values.crew.map((c) => c.name), values.date);
  await db.insert(dailyLogs).values({ id: randomUUID(), projectId, ...values });
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// Fix a mistake after submitting. The log is marked as edited (who and when);
// weekly T&M invoices that were already generated are frozen snapshots and are
// not changed by this.
export async function updateLog(projectId: string, logId: string, formData: FormData): Promise<{ error?: string }> {
  const current = await getSessionAndProfile();
  if (!current) return { error: "Please sign in again." };
  if (isSafetyViewer(current.profile)) return { error: "This account is view-only." };
  const project = await requireProject(projectId);
  const existing = await db.query.dailyLogs.findFirst({ where: and(eq(dailyLogs.id, logId), eq(dailyLogs.projectId, projectId)) });
  if (!existing) return { error: "That log no longer exists." };

  const prepared = await prepareLog(project, formData, existing.quantities || []);
  if ("error" in prepared) return { error: prepared.error };
  const { values } = prepared;

  await db
    .update(dailyLogs)
    .set({ ...values, editedAt: new Date(), editedBy: current.profile.name })
    .where(eq(dailyLogs.id, logId));
  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function deleteLog(projectId: string, id: string) {
  await assertNotSafety();
  await db.delete(dailyLogs).where(eq(dailyLogs.id, id));
  revalidatePath(`/projects/${projectId}`);
}
