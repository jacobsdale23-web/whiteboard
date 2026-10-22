"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getSessionAndProfile, isSafetyViewer } from "@/lib/auth/current-user";
import { improveLogDescription } from "@/lib/improve-text";

const MAX_CHARS = 4000;

// Returns a suggestion only; nothing is saved. The foreman reviews it and
// chooses whether to use it.
export async function improveDescription(
  projectId: string,
  text: string,
  kind: "log" | "hazards" = "log"
): Promise<{ error?: string; improved?: string }> {
  const current = await getSessionAndProfile();
  if (!current) return { error: "Please sign in again." };
  if (isSafetyViewer(current.profile)) return { error: "This account is view-only." };

  const clean = text.trim();
  if (!clean) return { error: "Write your notes first, then tap Improve." };
  if (clean.length > MAX_CHARS) return { error: "That description is too long to improve in one go." };

  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  try {
    return { improved: await improveLogDescription(clean, project?.name || "", kind) };
  } catch (e) {
    console.error("improveDescription failed", e);
    return { error: "The AI helper isn't available right now. You can still submit your description as written." };
  }
}
