"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { crewSchedule, projects } from "@/lib/db/schema";
import { assertNotSafety } from "@/lib/auth/current-user";
import { assertCompanyAccess } from "@/lib/auth/company";
import { rememberNames } from "@/lib/people";
import { cleanScheduleInput } from "@/lib/schedule";

export type ScheduleFormState = { error?: string; saved?: number } | null;

const text = (f: FormData, k: string) => String(f.get(k) ?? "");

// Add or change a stint (one person on one job for a run of days). Several people can be sent at once: the person
// field takes a list separated by commas, and each gets their own row.
export async function saveScheduleRow(_prev: ScheduleFormState, formData: FormData): Promise<ScheduleFormState> {
  await assertNotSafety();
  const id = text(formData, "id");
  const projectId = text(formData, "projectId");
  const project = projectId ? await db.query.projects.findFirst({ where: eq(projects.id, projectId) }) : null;
  if (!project) return { error: "Pick the job." };
  await assertCompanyAccess(project.companyId);

  const names = id ? [text(formData, "person")] : text(formData, "person").split(",");
  const wanted = names.map((n) => n.trim()).filter(Boolean);
  if (!wanted.length) return { error: "Pick who is going." };
  const resolved = await rememberNames(project.companyId, wanted);

  const rows = [];
  for (const raw of wanted) {
    const checked = cleanScheduleInput({
      person: resolved.get(raw) ?? raw,
      startDate: text(formData, "startDate"),
      endDate: text(formData, "endDate"),
      location: text(formData, "location"),
      taskNumber: text(formData, "taskNumber"),
      note: text(formData, "note"),
    });
    if ("error" in checked) return { error: checked.error };
    rows.push(checked.value);
  }

  if (id) {
    const existing = await db.query.crewSchedule.findFirst({ where: eq(crewSchedule.id, id) });
    if (!existing || existing.companyId !== project.companyId) return { error: "That schedule line no longer exists." };
    await db.update(crewSchedule).set({ projectId, ...rows[0] }).where(eq(crewSchedule.id, id));
  } else {
    await db.insert(crewSchedule).values(rows.map((r) => ({ id: randomUUID(), companyId: project.companyId, projectId, ...r })));
  }

  revalidatePath("/calendar");
  revalidatePath(`/projects/${projectId}`);
  return { saved: rows.length };
}

export async function deleteScheduleRow(id: string): Promise<{ error?: string }> {
  await assertNotSafety();
  const existing = await db.query.crewSchedule.findFirst({ where: eq(crewSchedule.id, id) });
  if (!existing) return {};
  await assertCompanyAccess(existing.companyId);
  await db.delete(crewSchedule).where(eq(crewSchedule.id, id));
  revalidatePath("/calendar");
  revalidatePath(`/projects/${existing.projectId}`);
  return {};
}
