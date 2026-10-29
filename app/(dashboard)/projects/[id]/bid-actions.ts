"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunities, projects } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { canAccessCompany } from "@/lib/auth/company";

async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage budget data.");
  }
}

// Ties a won bid (an Opportunity) to an existing project so the bid shows in the project's Budget section.
export async function attachBid(formData: FormData) {
  await requireAdmin();
  const projectId = String(formData.get("projectId") || "");
  const opportunityId = String(formData.get("opportunityId") || "");
  if (!projectId || !opportunityId) throw new Error("Pick a bid to attach.");

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  const opp = await db.query.opportunities.findFirst({ where: eq(opportunities.id, opportunityId) });
  if (!project || !opp) throw new Error("That project or bid no longer exists.");
  if (!(await canAccessCompany(project.companyId)) || project.companyId !== opp.companyId) throw new Error("That bid belongs to a different company.");
  if (opp.bidStatus !== "Won") throw new Error("Only won bids can be attached to a project.");

  await db.update(opportunities).set({ convertedProjectId: projectId }).where(eq(opportunities.id, opportunityId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/opportunities");
}

// Removes the link only; the bid itself stays on the Opportunities page.
export async function detachBid(formData: FormData) {
  await requireAdmin();
  const projectId = String(formData.get("projectId") || "");
  const opportunityId = String(formData.get("opportunityId") || "");
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project || !(await canAccessCompany(project.companyId))) throw new Error("That project no longer exists.");

  await db.update(opportunities).set({ convertedProjectId: null }).where(eq(opportunities.id, opportunityId));
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/opportunities");
}
