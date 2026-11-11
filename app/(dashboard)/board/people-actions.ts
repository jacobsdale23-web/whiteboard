"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { crew, projectManagers, projects } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireCompany } from "@/lib/auth/company";
import { cleanPmName } from "@/lib/pms";

// Managing the PM pool and the foremen list is an admin job.
async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") throw new Error("Only admins can change these lists.");
}

function refresh() {
  revalidatePath("/board");
  revalidatePath("/calendar");
}

export type PeopleResult = { error?: string };

export async function addPm(rawName: string): Promise<PeopleResult> {
  try {
    await requireAdmin();
    const name = cleanPmName(rawName);
    if (!name) return { error: "Type the PM's name." };
    const [existing] = await db.select().from(projectManagers).where(sql`lower(${projectManagers.name}) = ${name.toLowerCase()}`);
    if (existing) {
      // Adding a name that was removed earlier brings it back.
      if (!existing.active) await db.update(projectManagers).set({ active: true }).where(eq(projectManagers.id, existing.id));
      else return { error: `${existing.name} is already a PM.` };
    } else {
      await db.insert(projectManagers).values({ id: randomUUID(), name, active: true });
    }
    refresh();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add that PM." };
  }
}

// Removing a PM only takes the name off the pick list. Jobs that already have them keep their name.
export async function removePm(id: string): Promise<PeopleResult> {
  try {
    await requireAdmin();
    await db.update(projectManagers).set({ active: false }).where(eq(projectManagers.id, id));
    refresh();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't remove that PM." };
  }
}

// Renaming carries over to every job that has this PM.
export async function renamePm(id: string, rawName: string): Promise<PeopleResult> {
  try {
    await requireAdmin();
    const name = cleanPmName(rawName);
    if (!name) return { error: "Type the PM's name." };
    const [row] = await db.select().from(projectManagers).where(eq(projectManagers.id, id));
    if (!row) return { error: "That PM no longer exists." };
    const [clash] = await db.select().from(projectManagers).where(sql`lower(${projectManagers.name}) = ${name.toLowerCase()} and ${projectManagers.id} <> ${id}`);
    if (clash) return { error: `${clash.name} is already a PM.` };
    await db.update(projectManagers).set({ name }).where(eq(projectManagers.id, id));
    await db.update(projects).set({ pm: name }).where(eq(projects.pm, row.name));
    refresh();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't rename that PM." };
  }
}

// A foreman is a crew-list name with the foreman role. Typing someone who is already on the crew list (or was removed
// before) makes them a foreman again instead of creating a duplicate.
export async function addForeman(rawName: string): Promise<PeopleResult> {
  try {
    await requireAdmin();
    const company = await requireCompany();
    const name = cleanPmName(rawName);
    if (!name) return { error: "Type the foreman's name." };
    const [existing] = await db.select().from(crew).where(and(eq(crew.companyId, company.id), sql`lower(${crew.name}) = ${name.toLowerCase()}`));
    if (existing) {
      if (existing.role === "foreman" && existing.active) return { error: `${existing.name} is already a foreman.` };
      await db.update(crew).set({ role: "foreman", active: true }).where(eq(crew.id, existing.id));
    } else {
      await db.insert(crew).values({ id: randomUUID(), companyId: company.id, name, active: true, role: "foreman" });
    }
    refresh();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add that foreman." };
  }
}

// Takes the person off the foremen list and the pick lists. Their past daily logs and jobs keep the name.
export async function removeForeman(id: string): Promise<PeopleResult> {
  try {
    await requireAdmin();
    const company = await requireCompany();
    await db.update(crew).set({ active: false }).where(and(eq(crew.id, id), eq(crew.companyId, company.id)));
    refresh();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't remove that foreman." };
  }
}
