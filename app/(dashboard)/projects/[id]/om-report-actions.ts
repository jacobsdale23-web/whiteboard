"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { omReports } from "@/lib/db/schema";
import { rememberNames } from "@/lib/people";
import { getSessionAndProfile, isSafetyViewer } from "@/lib/auth/current-user";
import { canOpenProject, requireProject } from "@/lib/auth/company";
import { deleteObject, getDownloadUrl, getUploadUrl } from "@/lib/storage/s3";
import { MAX_OM_PHOTOS, addableSections, cleanOmData, omJobType, type OmData, type OmPhoto } from "@/lib/om-report";

export type OmReportInput = {
  date: string;
  jobType: string;
  extras: string[];
  technician: string;
  data: OmData;
  photos: OmPhoto[];
  signature: string | null;
};

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };

// Same open access as daily logs: any signed-in crew member, except the view-only safety account.
async function requireUser() {
  const current = await getSessionAndProfile();
  if (!current || isSafetyViewer(current.profile)) return null;
  return current;
}

// Photos go phone -> storage on a presigned URL, so a big photo never has to squeeze through a serverless function.
export async function requestOmPhotoUpload(projectId: string, contentType: string): Promise<{ error?: string; uploadUrl?: string; storageKey?: string }> {
  if (!(await requireUser())) return { error: "Please sign in again." };
  if (!(await canOpenProject(projectId))) return { error: "Project not found." };
  const ext = PHOTO_TYPES[contentType];
  if (!ext) return { error: "Please use a JPG or PNG photo." };
  const storageKey = `om-reports/${projectId}/${randomUUID()}.${ext}`;
  return { uploadUrl: await getUploadUrl(storageKey, contentType), storageKey };
}

// The crew member backed out after the photo went up: remove the orphan unless a report already uses it.
export async function discardOmPhoto(projectId: string, storageKey: string): Promise<void> {
  if (!(await requireUser())) return;
  if (!storageKey.startsWith(`om-reports/${projectId}/`)) return;
  const reports = await db.select({ photos: omReports.photos }).from(omReports).where(eq(omReports.projectId, projectId));
  if (reports.some((r) => (r.photos || []).some((p) => p.key === storageKey))) return;
  await deleteObject(storageKey).catch(() => {});
}

export async function saveOmReport(projectId: string, input: OmReportInput, reportId?: string): Promise<{ error?: string; id?: string }> {
  const current = await requireUser();
  if (!current) return { error: "Please sign in again, or this account is view-only." };
  const project = await requireProject(projectId);

  const jt = omJobType(input.jobType);
  if (!jt) return { error: "Pick what kind of job this was." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Pick the date the work was done." };
  const technician = String(input.technician || "").trim().slice(0, 120);
  if (!technician) return { error: "Enter the technician's name." };

  const allowed = new Set(addableSections(jt.id, []).map((s) => s.id));
  const extras = [...new Set((input.extras || []).filter((e) => allowed.has(e)))];

  const isAdmin = current.profile.role === "admin";
  let existing: typeof omReports.$inferSelect | undefined;
  if (reportId) {
    existing = await db.query.omReports.findFirst({ where: and(eq(omReports.id, reportId), eq(omReports.projectId, projectId)) });
    if (!existing) return { error: "That report no longer exists." };
  }

  const data = cleanOmData(jt.id, extras, input.data, { isAdmin });
  // Billing info is the office's field: keep what an admin entered when a crew member edits the report.
  if (!isAdmin && existing?.data?.officeJobInfo) data.officeJobInfo = existing.data.officeJobInfo;
  if (!data.address) return { error: "Enter the job address." };
  if (!data.narrative) return { error: "Describe what happened and how the work was done." };
  if (jt.sections.includes("leak") && !data.leakFound) return { error: "Say whether a leak was found." };

  const photos = (input.photos || []).slice(0, MAX_OM_PHOTOS).map((p) => ({ key: String(p.key), caption: String(p.caption || "").trim().slice(0, 200) }));
  if (photos.some((p) => !p.key.startsWith(`om-reports/${projectId}/`))) return { error: "One of the photos doesn't belong to this job." };

  const sig = input.signature && input.signature.startsWith("data:image/png;base64,") && input.signature.length < 300_000 ? input.signature : null;

  const resolved = await rememberNames(project.companyId, [technician]);
  const values = { date: input.date, jobType: jt.id, extras, data, photos, technician: resolved.get(technician) || technician, signature: sig };

  if (existing) {
    await db.update(omReports).set({ ...values, editedAt: new Date(), editedBy: current.profile.name }).where(eq(omReports.id, existing.id));
    // Photos taken off the report are gone for good.
    const kept = new Set(photos.map((p) => p.key));
    await Promise.all((existing.photos || []).filter((p) => !kept.has(p.key)).map((p) => deleteObject(p.key).catch(() => {})));
    revalidatePath(`/projects/${projectId}`);
    return { id: existing.id };
  }

  const id = randomUUID();
  await db.insert(omReports).values({ id, projectId, ...values, submittedBy: current.profile.name });
  revalidatePath(`/projects/${projectId}`);
  return { id };
}

export async function deleteOmReport(projectId: string, id: string): Promise<{ error?: string }> {
  if (!(await requireUser())) return { error: "Please sign in again." };
  if (!(await canOpenProject(projectId))) return { error: "Project not found." };
  const report = await db.query.omReports.findFirst({ where: and(eq(omReports.id, id), eq(omReports.projectId, projectId)) });
  if (!report) return {};
  await Promise.all((report.photos || []).map((p) => deleteObject(p.key).catch(() => {})));
  await db.delete(omReports).where(eq(omReports.id, id));
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// Short-lived links to a report's photos, in the order they were added.
export async function getOmPhotoUrls(projectId: string, id: string): Promise<{ error?: string; photos?: { url: string; caption: string; key: string }[] }> {
  const current = await getSessionAndProfile();
  if (!current) return { error: "Please sign in again." };
  if (!(await canOpenProject(projectId))) return { error: "Project not found." };
  const report = await db.query.omReports.findFirst({ where: and(eq(omReports.id, id), eq(omReports.projectId, projectId)) });
  if (!report) return { error: "Report not found." };
  const photos = await Promise.all((report.photos || []).map(async (p) => ({ key: p.key, caption: p.caption, url: await getDownloadUrl(p.key) })));
  return { photos };
}
