"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailyLogs } from "@/lib/db/schema";
import { getSessionAndProfile, isSafetyViewer } from "@/lib/auth/current-user";
import { canOpenProject } from "@/lib/auth/company";
import { deleteObject, getDownloadUrl, getUploadUrl } from "@/lib/storage/s3";

const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };

// Same open access as the logs themselves: any signed-in crew member, except the view-only safety account.
async function requireUser() {
  const current = await getSessionAndProfile();
  if (!current || isSafetyViewer(current.profile)) return null;
  return current;
}

// Photos go phone -> storage on a presigned URL, so a big photo never has to squeeze through a serverless function.
export async function requestLogPhotoUpload(projectId: string, contentType: string): Promise<{ error?: string; uploadUrl?: string; storageKey?: string }> {
  if (!(await requireUser())) return { error: "Please sign in again." };
  if (!(await canOpenProject(projectId))) return { error: "Project not found." };
  const ext = PHOTO_TYPES[contentType];
  if (!ext) return { error: "Please use a JPG or PNG photo." };
  const storageKey = `daily-logs/${projectId}/${randomUUID()}.${ext}`;
  return { uploadUrl: await getUploadUrl(storageKey, contentType), storageKey };
}

// The foreman backed out after the photo went up: remove the orphan unless a log already uses it.
export async function discardLogPhoto(projectId: string, storageKey: string): Promise<void> {
  if (!(await requireUser())) return;
  if (!storageKey.startsWith(`daily-logs/${projectId}/`)) return;
  const logs = await db.select({ photos: dailyLogs.photos }).from(dailyLogs).where(eq(dailyLogs.projectId, projectId));
  if (logs.some((l) => (l.photos || []).some((p) => p.key === storageKey))) return;
  await deleteObject(storageKey).catch(() => {});
}

// Short-lived links to a log's photos, in the order they were added.
export async function getLogPhotoUrls(projectId: string, logId: string): Promise<{ error?: string; photos?: { url: string; caption: string; key: string }[] }> {
  const current = await getSessionAndProfile();
  if (!current) return { error: "Please sign in again." };
  if (!(await canOpenProject(projectId))) return { error: "Project not found." };
  const log = await db.query.dailyLogs.findFirst({ where: and(eq(dailyLogs.id, logId), eq(dailyLogs.projectId, projectId)) });
  if (!log) return { error: "That log no longer exists." };
  const photos = await Promise.all((log.photos || []).map(async (p) => ({ key: p.key, caption: p.caption, url: await getDownloadUrl(p.key) })));
  return { photos };
}
