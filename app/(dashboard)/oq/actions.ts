"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { oqQuestions } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";

async function requireAdmin() {
  const current = await getSessionAndProfile();
  return current?.profile.role === "admin" ? current : null;
}

// Admin sets (or clears) the official answer for a question. Setting one counts
// as verified; clearing it puts the question back to unconfirmed / unscored.
export async function setOqAnswer(questionId: string, correctIndex: number | null): Promise<{ error?: string }> {
  if (!(await requireAdmin())) return { error: "Only admins can edit the answer key." };
  const q = await db.query.oqQuestions.findFirst({ where: eq(oqQuestions.id, questionId) });
  if (!q) return { error: "Question not found." };
  if (correctIndex !== null && (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= q.options.length)) {
    return { error: "That isn't one of the answer choices." };
  }

  // The stored explanation was written for the AI's pick; don't keep it if the admin chose differently.
  const explanationStillFits = correctIndex !== null && q.aiGuessIndex !== null && Number(q.aiGuessIndex) === correctIndex;
  await db
    .update(oqQuestions)
    .set({
      correctIndex: correctIndex === null ? null : (String(correctIndex) as never),
      keyStatus: correctIndex === null ? "unconfirmed" : "verified",
      explanation: explanationStillFits ? q.explanation : null,
    })
    .where(eq(oqQuestions.id, questionId));
  revalidatePath(`/oq/${q.examId}`);
  return {};
}

// "I've checked this exam's AI-suggested answers against our materials."
export async function verifyExamKey(examId: string): Promise<{ error?: string; count?: number }> {
  if (!(await requireAdmin())) return { error: "Only admins can edit the answer key." };
  const rows = await db
    .update(oqQuestions)
    .set({ keyStatus: "verified" })
    .where(and(eq(oqQuestions.examId, examId), eq(oqQuestions.keyStatus, "ai"), isNotNull(oqQuestions.correctIndex)))
    .returning({ id: oqQuestions.id });
  revalidatePath(`/oq/${examId}`);
  return { count: rows.length };
}
