import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { oqExams, oqExamTasks, oqQuestions } from "@/lib/db/schema";
import { findActiveInvite } from "@/lib/oq-invites";
import OqRunner, { type RunnerQuestion } from "@/app/(dashboard)/oq/[examId]/oq-runner";
import InvalidLink from "../../invalid-link";

// The same practice runner as inside White Board, reached through a personal
// link. No answer-key review or any other admin tools here.
export default async function PracticeExam({ params }: { params: Promise<{ token: string; examId: string }> }) {
  const { token, examId } = await params;
  const inv = await findActiveInvite(token);
  if (!inv) return <InvalidLink />;

  const exam = await db.query.oqExams.findFirst({ where: eq(oqExams.id, examId) });
  if (!exam) notFound();
  const [questions, tasks] = await Promise.all([
    db.select().from(oqQuestions).where(eq(oqQuestions.examId, examId)).orderBy(asc(oqQuestions.position)),
    db.select().from(oqExamTasks).where(eq(oqExamTasks.examId, examId)),
  ]);
  const sorted = questions.slice().sort((a, b) => Number(a.position) - Number(b.position));
  const runnerQuestions: RunnerQuestion[] = sorted.map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options,
    correctIndex: q.correctIndex === null ? null : Number(q.correctIndex),
    explanation: q.explanation,
    keyStatus: q.keyStatus,
  }));

  return (
    <section>
      <Link href={`/oq-practice/${token}`} style={{ fontSize: "0.9rem", color: "var(--ink-soft)", textDecoration: "underline" }}>
        ← All OQ practice tests
      </Link>
      <h2 style={{ margin: "10px 0 4px" }}>{exam.title}</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 16 }}>
        {tasks.map((t) => t.taskCode).sort().join(", ")} · {sorted.length} questions
      </p>
      <OqRunner questions={runnerQuestions} />
    </section>
  );
}
