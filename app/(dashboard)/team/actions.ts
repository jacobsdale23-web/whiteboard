"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profileCompanies, profiles } from "@/lib/db/schema";
import { getWorkspace } from "@/lib/auth/company";

// Real, server-enforced admin check — this is what actually protects role
// changes and Budget data, regardless of what any client-side UI shows.
async function requireAdmin() {
  const current = await getWorkspace();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage team roles.");
  }
  return current;
}

// An admin manages people in their own companies, plus anyone not yet assigned
// to a company. All-company admins manage everyone.
async function requireAdminOver(userId: string) {
  const current = await requireAdmin();
  if (current.profile.allCompanies) return current;
  const rows = await db.select({ companyId: profileCompanies.companyId }).from(profileCompanies).where(eq(profileCompanies.profileId, userId));
  const mine = new Set(current.companies.map((c) => c.id));
  if (rows.length && !rows.some((r) => mine.has(r.companyId))) throw new Error("That person isn't in your company.");
  return current;
}

export async function setMechanic(userId: string, isMechanic: boolean) {
  await requireAdminOver(userId);
  await db.update(profiles).set({ isMechanic }).where(eq(profiles.id, userId));
  revalidatePath("/team");
  revalidatePath("/equipment");
}

// A safety coordinator account is view-only (projects, calendar, logs, JSAs,
// OQ practice) and receives the weekly JSA email. Admins can't be marked.
export async function setSafety(userId: string, isSafety: boolean) {
  await requireAdminOver(userId);
  const target = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  if (target?.role === "admin") throw new Error("Admins can't be set as a safety coordinator.");
  if (isSafety && target?.isHR) throw new Error("Remove their HR access first; a safety coordinator account is view-only.");
  await db.update(profiles).set({ isSafety }).where(eq(profiles.id, userId));
  revalidatePath("/team");
}

// HR users (like admins) can open the HR module: candidates, employees, drug &
// alcohol testing and OQ qualifications. Admins already have it.
export async function setHR(userId: string, isHR: boolean) {
  await requireAdminOver(userId);
  const target = await db.query.profiles.findFirst({ where: eq(profiles.id, userId) });
  if (target?.role === "admin") throw new Error("Admins already have HR access.");
  if (isHR && target?.isSafety) throw new Error("A safety coordinator account is view-only and can't have HR access.");
  await db.update(profiles).set({ isHR }).where(eq(profiles.id, userId));
  revalidatePath("/team");
}

export async function setRole(userId: string, role: "admin" | "member") {
  const current = await requireAdminOver(userId);
  if (current.profile.id === userId && role !== "admin") {
    throw new Error("You can't remove your own admin access — have another admin do it.");
  }
  await db.update(profiles).set({ role }).where(eq(profiles.id, userId));
  revalidatePath("/team");
}

// Give or take away access to one company. An admin can only change companies
// they can open themselves.
export async function setCompanyAccess(userId: string, companyId: string, on: boolean) {
  const current = await requireAdmin();
  if (!current.companies.some((c) => c.id === companyId)) throw new Error("You don't have access to that company.");
  if (on) {
    await db.insert(profileCompanies).values({ profileId: userId, companyId }).onConflictDoNothing();
  } else {
    if (current.profile.id === userId && !current.profile.allCompanies && current.companies.length === 1) {
      throw new Error("You can't remove your own access to your only company.");
    }
    await db.delete(profileCompanies).where(and(eq(profileCompanies.profileId, userId), eq(profileCompanies.companyId, companyId)));
  }
  revalidatePath("/team");
}

// People who work across every company. Only another all-company admin can change this.
export async function setAllCompanies(userId: string, allCompanies: boolean) {
  const current = await requireAdmin();
  if (!current.profile.allCompanies) throw new Error("Only an all-company admin can do that.");
  if (current.profile.id === userId && !allCompanies) throw new Error("You can't remove your own all-company access — have another all-company admin do it.");
  await db.update(profiles).set({ allCompanies }).where(eq(profiles.id, userId));
  revalidatePath("/team");
}
