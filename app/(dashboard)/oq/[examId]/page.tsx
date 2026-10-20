import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { oqExams, oqExamTasks, oqQuestions } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import OqRunner, { type RunnerQuestion } from "./oq-runner";
import OqKeyReview from "./oq-key-review";

export default async function OqExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  const exam = await db.query.oqExams.findFirst({ where: eq(oqExams.id, examId) });
  if (!exam) notFound();

  const [questions, tasks, current] = await Promise.all([
    db.select().from(oqQuestions).where(eq(oqQuestions.examId, examId)).orderBy(asc(oqQuestions.position)),
    db.select().from(oqExamTasks).where(eq(oqExamTasks.examId, examId)),
    getSessionAndProfile(),
  ]);
  const isAdmin = current?.profile.role === "admin";
  const sorted = questions.slice().sort((a, b) => Number(a.position) - Number(b.position));

  const runnerQuestions: RunnerQuestion[] = sorted.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options,
    correctIndex: q.correctIndex === null ? null : Number(q.correctIndex),
    explanation: q.explanation,
    keyStatus: q.keyStatus,
  }));
  const unconfirmed = sorted.filter((q) => q.correctIndex === null).length;
  const unverified = sorted.filter((q) => q.keyStatus === "ai").length;

  return (
    <section>
      <Link href="/oq" style={{ fontSize: "0.9rem", color: "var(--ink-soft)", textDecoration: "underline" }}>
        ← All OQ practice tests
      </Link>
      <h2 style={{ margin: "10px 0 4px" }}>{exam.title}</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 16 }}>
        {tasks.map((t) => t.taskCode).sort().join(", ")} · {sorted.length} questions
      </p>

      <OqRunner questions={runnerQuestions} />

      {isAdmin && (
        <OqKeyReview
          examId={examId}
          unconfirmed={unconfirmed}
          unverified={unverified}
          questions={sorted.map((q) => ({
            id: q.id,
            text: q.text,
            options: q.options,
            correctIndex: q.correctIndex === null ? null : Number(q.correctIndex),
            aiGuessIndex: q.aiGuessIndex === null ? null : Number(q.aiGuessIndex),
            keyStatus: q.keyStatus,
          }))}
        />
      )}
    </section>
  );
}
