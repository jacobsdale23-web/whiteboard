"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jsaForms } from "@/lib/db/schema";
import { HAZARD_LIBRARY } from "@/lib/jsa-library";

export async function addJsa(projectId: string, formData: FormData) {
  const date = String(formData.get("date") || "");
  const foreman = String(formData.get("foreman") || "").trim();
  if (!date || !foreman) return;

  const weather = String(formData.get("weather") || "").trim() || null;
  const taskTypes = formData.getAll("taskTypes").map(String);
  const ppe = formData.getAll("ppe").map(String);
  const additionalHazards = String(formData.get("additionalHazards") || "").trim() || null;
  const emergencyInfo = String(formData.get("emergencyInfo") || "").trim() || null;

  const hazardKeys = formData.getAll("hazard").map(String); // "taskType||hazard"
  const hazards = hazardKeys
    .map((key) => {
      const [taskType, hazard] = key.split("||");
      const control = HAZARD_LIBRARY[taskType]?.find((h) => h.hazard === hazard)?.control;
      return control ? { taskType, hazard, control } : null;
    })
    .filter((h): h is { taskType: string; hazard: string; control: string } => h !== null);

  const crewNames = formData.getAll("crewName").map(String).map((n) => n.trim()).filter(Boolean);
  const crew = crewNames.map((name) => ({ name, acknowledgedAt: null as string | null }));

  await db.insert(jsaForms).values({
    id: randomUUID(),
    projectId,
    date,
    foreman,
    weather,
    taskTypes,
    hazards,
    ppe,
    additionalHazards,
    emergencyInfo,
    crew,
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteJsa(projectId: string, id: string) {
  await db.delete(jsaForms).where(eq(jsaForms.id, id));
  revalidatePath(`/projects/${projectId}`);
}

// No auth gate — this mirrors a paper JSA passed around the truck for
// everyone to initial, so any crew member on the shared device can tap
// their own name.
export async function acknowledgeJsa(projectId: string, jsaId: string, crewIndex: number) {
  const [jsa] = await db.select().from(jsaForms).where(eq(jsaForms.id, jsaId));
  if (!jsa) return;
  const crew = (jsa.crew || []).map((c, i) => (i === crewIndex ? { ...c, acknowledgedAt: new Date().toISOString() } : c));
  await db.update(jsaForms).set({ crew }).where(eq(jsaForms.id, jsaId));
  revalidatePath(`/projects/${projectId}`);
}
