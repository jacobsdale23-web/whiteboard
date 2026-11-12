"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireCompany } from "@/lib/auth/company";
import { getConnection, qbConfig, QbError } from "@/lib/quickbooks";
import { createQbJob, listQbJobs, resolveParentCustomer } from "@/lib/qb-jobs";
import { nextProjectNumber, qbSafeName } from "@/lib/qb-compare";

export type CheckResult = { error?: string; message?: string };

const yearPrefix = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(2, 4);

// Admin-only, Feliciana-only for now (O&M reuses Feliciana's numbers and has unnumbered jobs; PIP has none).
async function requireFwiAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") throw new Error("Only admins can do this.");
  const company = await requireCompany();
  if (company.id !== "fwi") throw new Error("This works for Feliciana Welders only for now.");
  if (!qbConfig().configured) throw new Error("QuickBooks isn't set up for White Board yet.");
  if (!(await getConnection(company.id))) throw new Error("QuickBooks isn't connected for this company.");
  return { companyId: company.id };
}

function refresh() {
  revalidatePath("/qb-check");
  revalidatePath("/board");
  revalidatePath("/calendar");
}

// A job QuickBooks has and White Board doesn't: add it here, number and all. It starts as Upcoming; set the dates and status on the board.
export async function addQbJobToWhiteBoard(qbJobId: string): Promise<CheckResult> {
  try {
    const { companyId } = await requireFwiAdmin();
    const job = (await listQbJobs(companyId)).find((j) => j.id === qbJobId);
    if (!job) return { error: "QuickBooks no longer has that job." };
    const [dupe] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.companyId, companyId), eq(projects.projectNumber, job.number)));
    if (dupe) return { error: `White Board already has a job numbered ${job.number}.` };
    await db.insert(projects).values({
      id: randomUUID(),
      companyId,
      name: job.name,
      customer: job.parent,
      projectNumber: job.number,
      status: "upcoming",
      billingType: "lump_sum",
      crew: [],
    });
    refresh();
    return { message: `Added ${job.number} - ${job.name} to White Board as Upcoming.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add that job." };
  }
}

// A White Board job QuickBooks doesn't have: create it in QuickBooks under its customer, using the job's own number or
// (when it has none) the next one, and write the number back here. This is a real change in the books.
export async function createJobInQuickBooks(projectId: string): Promise<CheckResult> {
  try {
    const { companyId } = await requireFwiAdmin();
    const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.companyId, companyId)));
    if (!project) return { error: "That project no longer exists." };
    if (project.jobKind === "fwi_hot_tap") return { error: "An FWI hot tap is billed through its parent job and gets no number of its own." };
    if (!project.customer?.trim()) return { error: "Give the project a customer first. If QuickBooks doesn't have that customer yet, it is created for you." };

    const qbJobs = await listQbJobs(companyId);
    const yy = yearPrefix();
    let number = project.projectNumber;
    if (number) {
      if (qbJobs.some((j) => j.number === number)) return { error: `QuickBooks already has a job numbered ${number}.` };
    } else {
      const wbNumbers = (await db.select({ n: projects.projectNumber }).from(projects).where(eq(projects.companyId, companyId))).map((r) => r.n);
      number = nextProjectNumber(yy, qbJobs.map((j) => j.number), wbNumbers);
    }

    // The customer comes from the White Board project. If QuickBooks doesn't have it, it is created (name only).
    const parent = await resolveParentCustomer(companyId, project.customer.trim());
    if (typeof parent === "string") return { error: parent };
    const customerNote = parent.created
      ? ` Also created the customer "${parent.DisplayName}" in QuickBooks (name only).${parent.near.length ? ` Similar customers already there: ${parent.near.join("; ")} — if one is the same company, merge them in QuickBooks.` : ""}`
      : "";

    const displayName = `${number} - ${qbSafeName(project.name)}`;
    let created;
    try {
      created = await createQbJob(companyId, displayName, parent.Id);
    } catch (e) {
      const why = e instanceof Error ? e.message : "unknown error";
      return { error: `${why}${parent.created ? ` (The customer "${parent.DisplayName}" was created in QuickBooks before this failed, so trying again will reuse it.)` : ""}` };
    }
    // Only after QuickBooks confirms does the number go on the White Board job.
    await db.update(projects).set({ projectNumber: number }).where(eq(projects.id, projectId));
    refresh();
    revalidatePath(`/projects/${projectId}`);
    const kind = created.isProject === true ? "QuickBooks lists it as a Project" : created.isProject === false ? "QuickBooks lists it as a sub-customer, NOT a Project — check the Projects page" : "check the Projects page to see whether it appears there";
    return { message: `Created "${displayName}" in QuickBooks under ${parent.DisplayName} and set ${number} on this job. ${kind}.${customerNote}` };
  } catch (e) {
    if (e instanceof QbError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Couldn't create that job in QuickBooks." };
  }
}
