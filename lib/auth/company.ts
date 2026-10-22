import { cache } from "react";
import { cookies } from "next/headers";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, profileCompanies, projects } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";

export const COMPANY_COOKIE = "wb_company";
export type Company = typeof companies.$inferSelect;

// Every company this person may open. All-company users get them all (including
// any added later); everyone else gets the ones assigned on the Team page.
const companiesFor = cache(async (profileId: string, allCompanies: boolean): Promise<Company[]> => {
  if (allCompanies) return db.select().from(companies).orderBy(asc(companies.sortOrder));
  const rows = await db.select({ companyId: profileCompanies.companyId }).from(profileCompanies).where(eq(profileCompanies.profileId, profileId));
  if (!rows.length) return [];
  return db.select().from(companies).where(inArray(companies.id, rows.map((r) => r.companyId))).orderBy(asc(companies.sortOrder));
});

// The signed-in person, the companies they can open, and the one they are
// looking at (the cookie, if it is still one they may open; otherwise their first).
// `active` is null for an account that has not been assigned to a company yet.
export const getWorkspace = cache(async () => {
  const current = await getSessionAndProfile();
  if (!current) return null;
  const list = await companiesFor(current.profile.id, current.profile.allCompanies);
  const wanted = (await cookies()).get(COMPANY_COOKIE)?.value;
  const active = list.find((c) => c.id === wanted) ?? list[0] ?? null;
  return { ...current, companies: list, active };
});

// For pages and actions that read or write company data: the company in view.
export async function requireCompany(): Promise<Company> {
  const ws = await getWorkspace();
  if (!ws?.active) throw new Error("Your account has not been given access to a company yet.");
  return ws.active;
}

// True when the signed-in person may open this company's records.
export async function canAccessCompany(companyId: string): Promise<boolean> {
  const ws = await getWorkspace();
  return !!ws && ws.companies.some((c) => c.id === companyId);
}

export async function assertCompanyAccess(companyId: string): Promise<void> {
  if (!(await canAccessCompany(companyId))) throw new Error("You don't have access to that company.");
}

// Loads a project and makes sure the signed-in person may open its company.
// Server actions that take a projectId use this so a guessed id can't reach
// another company's records.
export async function requireProject(projectId: string) {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) throw new Error("That project no longer exists.");
  await assertCompanyAccess(project.companyId);
  return project;
}

// Same check as requireProject, as a yes/no for actions that return { error }.
export async function canOpenProject(projectId: string): Promise<boolean> {
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  return !!project && (await canAccessCompany(project.companyId));
}

// Where to send someone who opened a record that belongs to another of their
// companies (a bookmark, say): the route flips the cookie, then comes back.
export function switchCompanyUrl(companyId: string, next: string): string {
  return `/switch-company?to=${encodeURIComponent(companyId)}&next=${encodeURIComponent(next)}`;
}
