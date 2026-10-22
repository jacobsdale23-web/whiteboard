import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { hrCandidates, hrDrugTests, hrEmployees, hrOqQuals, oqExamTasks } from "@/lib/db/schema";
import { requireHrPage } from "@/lib/hr-access";
import { daProgramLabel, employeeStatusLabel } from "@/lib/hr";
import EmployeeForm from "../../employee-form";
import DrugTests from "../../drug-tests";
import OqQuals from "../../oq-quals";
import { DeleteRecord } from "../../row-controls";
import { card, chip } from "../../hr-styles";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await requireHrPage();
  const { id } = await params;
  const e = await db.query.hrEmployees.findFirst({ where: eq(hrEmployees.id, id) });
  if (!e) notFound();

  const [tests, quals, taskRows, candidate] = await Promise.all([
    db.select().from(hrDrugTests).where(eq(hrDrugTests.employeeId, id)),
    db.select().from(hrOqQuals).where(eq(hrOqQuals.employeeId, id)),
    db.select().from(oqExamTasks).orderBy(asc(oqExamTasks.taskCode)),
    e.candidateId ? db.query.hrCandidates.findFirst({ where: eq(hrCandidates.id, e.candidateId) }) : Promise.resolve(undefined),
  ]);
  // Several practice exams can cover the same task code; list each code once.
  const tasks = [...new Map(taskRows.map((t) => [t.taskCode, { code: t.taskCode, name: t.taskName }])).values()].sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true })
  );
  const isAdmin = ws.profile.role === "admin";

  return (
    <div>
      <Link href="/hr/employees" style={{ display: "inline-block", marginBottom: 14, fontSize: "0.85rem", color: "var(--ink-soft)", textDecoration: "underline" }}>
        ← Back to Employees
      </Link>

      <div style={card}>
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: "1.3rem" }}>{e.name}</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <span style={chip(e.status === "active" ? "good" : e.status === "leave" ? "warn" : "muted")}>{employeeStatusLabel(e.status)}</span>
            <span style={chip(e.daProgram === "active" ? "good" : e.daProgram === "pending" ? "warn" : "muted")}>Testing program: {daProgramLabel(e.daProgram).split(" (")[0]}</span>
            {candidate && (
              <Link href={`/hr/candidates/${candidate.id}`} style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>
                Hiring record →
              </Link>
            )}
          </div>
        </div>
        <EmployeeForm
          employee={{
            id: e.id,
            companyId: e.companyId,
            name: e.name,
            position: e.position,
            phone: e.phone,
            email: e.email,
            personalEmail: e.personalEmail,
            address: e.address,
            hireDate: e.hireDate,
            status: e.status,
            terminatedDate: e.terminatedDate,
            daProgram: e.daProgram,
            daEnrolledDate: e.daEnrolledDate,
            notes: e.notes,
          }}
          companies={ws.allCompanies.map((c) => ({ id: c.id, name: c.name }))}
          defaultCompanyId={e.companyId}
        />
      </div>

      <div style={card}>
        <DrugTests
          subject={{ employeeId: e.id }}
          defaultType="random"
          tests={tests
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((t) => ({
              id: t.id,
              testType: t.testType,
              substance: t.substance,
              orderedDate: t.orderedDate,
              collectedDate: t.collectedDate,
              resultDate: t.resultDate,
              facility: t.facility,
              status: t.status,
              notes: t.notes,
              filename: t.filename,
              createdBy: t.createdBy,
            }))}
        />
      </div>

      <div style={card}>
        <OqQuals
          employeeId={e.id}
          tasks={tasks}
          quals={quals.map((q) => ({ id: q.id, taskCode: q.taskCode, taskName: q.taskName, qualifiedDate: q.qualifiedDate, expiresDate: q.expiresDate }))}
        />
      </div>

      {isAdmin && <DeleteRecord kind="employee" id={e.id} />}
    </div>
  );
}
