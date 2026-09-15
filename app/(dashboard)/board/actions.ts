"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

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
};

export async function saveProject(id: string | null, data: ProjectInput) {
  if (!data.name.trim()) throw new Error("Project name is required.");

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
