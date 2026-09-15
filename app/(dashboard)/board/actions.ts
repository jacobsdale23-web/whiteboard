"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { computeNextProjectNumber } from "@/lib/project-numbers";

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
};

export async function saveProject(id: string | null, data: ProjectInput) {
  if (!data.name.trim()) throw new Error("Project name is required.");

  const existing = id ? await db.query.projects.findFirst({ where: eq(projects.id, id) }) : null;

  // Auto-assign only on the transition into "active" — never for upcoming
  // work or opportunities — and only for lump-sum/unit-price jobs. T&M
  // jobs use the client's own task/PO number instead (billing_tasks).
  let projectNumber = data.projectNumber?.trim() || existing?.projectNumber || null;
  const justActivated = data.status === "active" && (!existing || existing.status !== "active");
  if (!projectNumber && justActivated && data.billingType === "lump_sum") {
    const year = data.startDate ? parseInt(data.startDate.slice(0, 4), 10) : new Date().getFullYear();
    const lumpSumNumbers = await db.select({ projectNumber: projects.projectNumber }).from(projects).where(eq(projects.billingType, "lump_sum"));
    projectNumber = computeNextProjectNumber(lumpSumNumbers.map((r) => r.projectNumber), year);
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
  };

  if (id) {
    await db.update(projects).set(values).where(eq(projects.id, id));
  } else {
    await db.insert(projects).values({ id: randomUUID(), ...values });
  }

  revalidatePath("/board");
  revalidatePath("/calendar");
  if (id) revalidatePath(`/projects/${id}`);
}

export async function deleteProject(id: string) {
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath("/board");
  revalidatePath("/calendar");
}
