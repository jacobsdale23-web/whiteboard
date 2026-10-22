import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { hrCandidates, hrDrugTests } from "@/lib/db/schema";
import { requireHrPage } from "@/lib/hr-access";
import { PRE_EMPLOYMENT_LABEL, preEmploymentState } from "@/lib/hr";
import CandidateForm from "../../candidate-form";
import DrugTests from "../../drug-tests";
import { DeleteRecord, HirePanel, StageSelect } from "../../row-controls";
import { card, chip } from "../../hr-styles";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ws = await requireHrPage();
  const { id } = await params;
  const c = await db.query.hrCandidates.findFirst({ where: eq(hrCandidates.id, id) });
  if (!c) notFound();

  const tests = await db.select().from(hrDrugTests).where(eq(hrDrugTests.candidateId, id));
  const state = preEmploymentState(tests);
  const open = c.stage !== "hired";

  return (
    <div>
      <Link href="/hr/candidates" style={{ display: "inline-block", marginBottom: 14, fontSize: "0.85rem", color: "var(--ink-soft)", textDecoration: "underline" }}>
        ← Back to Candidates
      </Link>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: "1.3rem" }}>{c.name}</h3>
            <span style={chip(state === "cleared" ? "good" : state === "failed" || state === "refused" ? "bad" : state === "pending" ? "warn" : "muted")}>{PRE_EMPLOYMENT_LABEL[state]}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Stage</span>
            <StageSelect id={c.id} stage={c.stage} locked={!!c.employeeId} />
          </div>
        </div>
        {c.employeeId && (
          <p style={{ marginBottom: 14, fontSize: "0.88rem" }}>
            Hired. <Link href={`/hr/employees/${c.employeeId}`}>Open employee record →</Link>
          </p>
        )}
        <CandidateForm
          candidate={{
            id: c.id,
            companyId: c.companyId,
            name: c.name,
            phone: c.phone,
            email: c.email,
            position: c.position,
            source: c.source,
            stage: c.stage,
            appliedDate: c.appliedDate,
            notes: c.notes,
          }}
          companies={ws.allCompanies.map((x) => ({ id: x.id, name: x.name }))}
          defaultCompanyId={c.companyId}
        />
      </div>

      <div style={card}>
        <DrugTests
          subject={{ candidateId: c.id }}
          defaultType="pre_employment"
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

      {open && (
        <div style={card}>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 10 }}>Hire</h3>
          <HirePanel candidateId={c.id} position={c.position} cleared={state === "cleared"} />
        </div>
      )}

      {!c.employeeId && <DeleteRecord kind="candidate" id={c.id} />}
    </div>
  );
}
