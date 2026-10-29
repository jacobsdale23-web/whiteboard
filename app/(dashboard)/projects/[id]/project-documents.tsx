import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectFiles } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import ProjectDocumentsClient from "./project-documents-client";

// The original bid, contract and change orders kept with the job. Admin-only, like the Budget it sits under.
export default async function ProjectDocuments({ projectId }: { projectId: string }) {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") return null;
  const files = await db.select().from(projectFiles).where(eq(projectFiles.projectId, projectId)).orderBy(desc(projectFiles.uploadedAt));
  return (
    <ProjectDocumentsClient
      projectId={projectId}
      files={files.map((f) => ({ id: f.id, kind: f.kind, filename: f.filename, fileSize: Number(f.fileSize), uploadedAt: f.uploadedAt.toISOString() }))}
    />
  );
}
