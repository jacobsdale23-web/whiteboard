"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { equipmentTickets, projects } from "@/lib/db/schema";
import { getSessionAndProfile, isSafetyViewer } from "@/lib/auth/current-user";
import { canAccessCompany } from "@/lib/auth/company";

const URGENCIES = ["down", "repair_soon", "minor"];

// Any signed-in user (foremen included) can file a ticket; only admins and
// mechanics can read them back, on the Equipment page.
export async function addEquipmentTicket(projectId: string, formData: FormData): Promise<{ error?: string }> {
  const current = await getSessionAndProfile();
  if (!current) return { error: "Please sign in again." };
  if (isSafetyViewer(current.profile)) return { error: "This account is view-only." };

  const reportedBy = String(formData.get("reportedBy") || "").trim();
  const equipment = String(formData.get("equipment") || "").trim();
  const problem = String(formData.get("problem") || "").trim();
  const suspectedCause = String(formData.get("suspectedCause") || "").trim() || null;
  const urgencyRaw = String(formData.get("urgency") || "");
  const urgency = URGENCIES.includes(urgencyRaw) ? urgencyRaw : "repair_soon";
  const date = String(formData.get("date") || "") || new Date().toISOString().slice(0, 10);

  if (!reportedBy || !equipment || !problem) return { error: "Your name, the equipment, and what's wrong are all required." };

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project || !(await canAccessCompany(project.companyId))) return { error: "Project not found." };

  await db.insert(equipmentTickets).values({ id: randomUUID(), companyId: project.companyId, projectId, reportedBy, date, equipment, urgency, problem, suspectedCause });
  revalidatePath("/equipment");
  return {};
}
