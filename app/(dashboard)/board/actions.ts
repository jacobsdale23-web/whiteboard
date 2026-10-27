"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { QB_NUMBER_RE } from "@/lib/project-numbers";
import { assertNotSafety } from "@/lib/auth/current-user";
import { assertCompanyAccess, requireCompany } from "@/lib/auth/company";

export type ProjectInput = {
  name: string;
  location: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  value: number | null;
  crew: string[];
  billingType: string;
  projectNumber: string | null;
  customer: string | null;
};

export async function saveProject(id: string | null, data: ProjectInput) {
  await assertNotSafety();
  if (!data.name.trim()) throw new Error("Project name is required.");

  const company = await requireCompany();
  const existing = id ? await db.query.projects.findFirst({ where: eq(projects.id, id) }) : null;
  if (existing) await assertCompanyAccess(existing.companyId);
  const companyId = existing?.companyId ?? company.id;

  // Project numbers come from QuickBooks (the field clocks in against them), so
  // White Board never makes one up. A job without one is flagged until it is entered.
  const projectNumber = data.projectNumber?.trim() || null;
  if (projectNumber && !QB_NUMBER_RE.test(projectNumber)) {
    throw new Error("Use the project number exactly as it appears in QuickBooks (for example 26108).");
  }

  const values = {
    name: data.name.trim(),
    location: data.location,
    status: data.status,
    startDate: data.startDate,
    endDate: data.endDate,
    duration: data.duration,
    value: data.value as never,
    crew: data.crew,
    billingType: data.billingType,
    projectNumber,
    customer: data.customer?.trim() || null,
  };

  if (id) {
    await db.update(projects).set(values).where(eq(projects.id, id));
  } else {
    await db.insert(projects).values({ id: randomUUID(), companyId, ...values });
  }

  revalidatePath("/board");
  revalidatePath("/calendar");
  revalidatePath("/completed");
  if (id) revalidatePath(`/projects/${id}`);
}

const PROJECT_STATUSES = ["upcoming", "active", "complete", "billed"];

// Status-only change, used from the calendar timeline. A job marked complete
// with no completion date gets today's, so its bar still has an end on the
// timeline. (Project numbers are never assigned here: they come from QuickBooks.)
export async function setProjectStatus(id: string, status: string) {
  await assertNotSafety();
  if (!PROJECT_STATUSES.includes(status)) throw new Error("Unknown status.");
  const existing = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!existing) throw new Error("Project not found.");
  await assertCompanyAccess(existing.companyId);

  const changes: Partial<typeof projects.$inferInsert> = { status };
  if (status === "complete" && !existing.endDate) {
    changes.endDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  }
  await db.update(projects).set(changes).where(eq(projects.id, id));

  revalidatePath("/board");
  revalidatePath("/calendar");
  revalidatePath("/completed");
  revalidatePath(`/projects/${id}`);
}

// "complete" jobs stay on the calendar (grey) until they are billed; "billed"
// jobs drop off the calendar and live only in the Completed list.
export async function setProjectBilled(id: string, billed: boolean) {
  await assertNotSafety();
  const existing = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!existing) return;
  await assertCompanyAccess(existing.companyId);
  if (existing.status !== "complete" && existing.status !== "billed") throw new Error("Only a completed job can be marked billed.");
  await db.update(projects).set({ status: billed ? "billed" : "complete" }).where(eq(projects.id, id));
  revalidatePath("/board");
  revalidatePath("/calendar");
  revalidatePath("/completed");
  revalidatePath(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  await assertNotSafety();
  const existing = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!existing) return;
  await assertCompanyAccess(existing.companyId);
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath("/board");
  revalidatePath("/calendar");
}
