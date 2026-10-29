"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, projectFiles } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { canAccessCompany } from "@/lib/auth/company";
import { deleteObject, getDownloadUrl, getUploadUrl } from "@/lib/storage/s3";
import { PROJECT_FILE_KINDS, PROJECT_FILE_TYPES } from "@/lib/project-files";

// Contracts and bids are money documents: admin-only, and only for a project in a company the admin can reach.
async function requireProjectAdmin(projectId: string) {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") throw new Error("Only admins can manage project documents.");
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project || !(await canAccessCompany(project.companyId))) throw new Error("That project no longer exists.");
}

// The file goes browser -> storage through a short-lived signed URL (contracts can be large PDFs), so this only
// hands out that URL, the id and the key. The browser must send the returned contentType with the upload.
export async function requestProjectFileUpload(
  projectId: string,
  filename: string,
  kind: string
): Promise<{ error?: string; uploadUrl?: string; id?: string; storageKey?: string; contentType?: string }> {
  await requireProjectAdmin(projectId);
  if (!PROJECT_FILE_KINDS.includes(kind)) return { error: "Pick what kind of document this is." };
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const contentType = PROJECT_FILE_TYPES[ext];
  if (!contentType) return { error: "That file type isn't accepted. Use PDF, Word, Excel, or an image." };

  const id = randomUUID();
  const safeName = filename.replace(/[^A-Za-z0-9._-]+/g, "_");
  const storageKey = `projects/${projectId}/${id}-${safeName}`;
  const uploadUrl = await getUploadUrl(storageKey, contentType);
  return { uploadUrl, id, storageKey, contentType };
}

export async function confirmProjectFileUpload(
  projectId: string,
  file: { id: string; kind: string; filename: string; storageKey: string; fileSize: number }
): Promise<{ error?: string }> {
  await requireProjectAdmin(projectId);
  if (!PROJECT_FILE_KINDS.includes(file.kind)) return { error: "Pick what kind of document this is." };
  if (!file.storageKey.startsWith(`projects/${projectId}/`)) return { error: "That upload doesn't belong to this project." };
  await db.insert(projectFiles).values({
    id: file.id,
    projectId,
    kind: file.kind,
    filename: file.filename,
    storageKey: file.storageKey,
    fileSize: file.fileSize as never,
  });
  revalidatePath(`/projects/${projectId}`);
  return {};
}

export async function deleteProjectFile(projectId: string, id: string) {
  await requireProjectAdmin(projectId);
  const [file] = await db.select().from(projectFiles).where(and(eq(projectFiles.id, id), eq(projectFiles.projectId, projectId)));
  if (!file) return;
  await deleteObject(file.storageKey);
  await db.delete(projectFiles).where(eq(projectFiles.id, id));
  revalidatePath(`/projects/${projectId}`);
}

export async function getProjectFileDownloadUrl(projectId: string, id: string): Promise<string> {
  await requireProjectAdmin(projectId);
  const [file] = await db.select().from(projectFiles).where(and(eq(projectFiles.id, id), eq(projectFiles.projectId, projectId)));
  if (!file) throw new Error("File not found.");
  return getDownloadUrl(file.storageKey);
}
