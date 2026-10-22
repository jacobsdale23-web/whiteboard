import { db } from "@/lib/db";
import { companies, oqExams, oqExamTasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { findActiveInvite, recordInviteVisit } from "@/lib/oq-invites";
import OqList, { type OqTask } from "@/app/(dashboard)/oq/oq-list";
import InvalidLink from "../invalid-link";

export default async function PracticeHome({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await findActiveInvite(token);
  if (!inv) return <InvalidLink />;
  await recordInviteVisit(inv);

  const [exams, links, company] = await Promise.all([
    db.select().from(oqExams),
    db.select().from(oqExamTasks),
    db.query.companies.findFirst({ where: eq(companies.id, inv.companyId) }),
  ]);
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
      <h2 style={{ marginBottom: 6 }}>Hi {inv.name.trim().split(/\s+/)[0]}</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: 16 }}>
        {company?.name ? `${company.name} practice tests for your Operator Qualification evaluations. ` : ""}Pick a task, then a test. You&apos;ll see whether each answer is right as you go. Bookmark this page to come back.
      </p>
      <OqList tasks={tasks} basePath={`/oq-practice/${token}`} />
    </section>
  );
}
