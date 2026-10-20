import { db } from "@/lib/db";
import { oqExams, oqExamTasks } from "@/lib/db/schema";
import OqList, { type OqTask } from "./oq-list";

export default async function OqPage() {
  const [exams, links] = await Promise.all([db.select().from(oqExams), db.select().from(oqExamTasks)]);
  const examById = new Map(exams.map((e) => [e.id, e]));

  const byCode = new Map<string, OqTask>();
  for (const l of links) {
    const exam = examById.get(l.examId);
    if (!exam) continue;
    const task = byCode.get(l.taskCode) || { code: l.taskCode, name: l.taskName, exams: [] };
    task.exams.push({ id: exam.id, title: exam.title, count: Number(exam.questionCount) });
    byCode.set(l.taskCode, task);
  }
  const tasks = [...byCode.values()]
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((t) => ({ ...t, exams: t.exams.sort((a, b) => a.title.localeCompare(b.title)) }));

  return (
    <section>
      <h2 style={{ marginBottom: 6 }}>OQ Practice Tests</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: 16 }}>
        Practice for your Operator Qualification evaluations. Pick a task, then a test. You&apos;ll see whether each answer is right as you go.
      </p>
      <OqList tasks={tasks} />
    </section>
  );
}
