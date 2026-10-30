import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, milestones, dailyLogs, lineItems, expenses, invoices, payApps, sovItems, sovEntries, billingRates, billingTasks, tmInvoices, jsaForms, leakNumbers, receipts, omReports } from "@/lib/db/schema";
import { getSessionAndProfile, isSafetyViewer } from "@/lib/auth/current-user";
import { canAccessCompany, getWorkspace, switchCompanyUrl } from "@/lib/auth/company";
import MilestoneSection from "./milestone-section";
import LogSection from "./log-section";
import BudgetSection from "./budget-section";
import QuickBooksCard from "./quickbooks-card";
import BidReference from "./bid-reference";
import ProjectDocuments from "./project-documents";
import OmReportSection from "./om-report-section";
import { sortedPayApps, rollupAt } from "@/lib/sov";

// White Board's own billed-to-date (pay apps) and cost (receipts, expenses and
// vendor invoices), the same figures the Budget section shows.
function whiteboardFigures(b: {
  expenses: { amount: string }[];
  invoices: { amount: string }[];
  receipts: { amount: string }[];
  payApps: Parameters<typeof sortedPayApps>[0];
  sovItems: Parameters<typeof rollupAt>[0];
  sovEntries: Parameters<typeof rollupAt>[1];
}) {
  const ordered = sortedPayApps(b.payApps);
  const roll = ordered.length ? rollupAt(b.sovItems, b.sovEntries, ordered, ordered.length - 1) : null;
  const cost = [...b.expenses, ...b.invoices, ...b.receipts].reduce((sum, x) => sum + Number(x.amount || 0), 0);
  return { billed: roll ? roll.totalCompleted : null, cost };
}
import BillingSection from "./billing-section";
import JsaSection from "./jsa-section";
import EquipmentSection from "./equipment-section";
import ReceiptSection from "./receipt-section";
import { getPeople } from "@/lib/people";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project || !(await canAccessCompany(project.companyId))) notFound();
  // A link into another of their companies (a bookmark, say) switches company first.
  const workspace = await getWorkspace();
  if (workspace?.active && workspace.active.id !== project.companyId) redirect(switchCompanyUrl(project.companyId, `/projects/${id}`));

  const current = await getSessionAndProfile();
  const isAdmin = current?.profile.role === "admin";
  // Safety coordinator: schedule, JSAs and daily logs only, read-only.
  const readOnly = !!current && isSafetyViewer(current.profile);
  const people = await getPeople(project.companyId);
  const isTm = project.billingType === "tm";

  // O&M crews fill out a field report per job (the sections depend on the kind of job).
  const isOm = project.companyId === "om";

  const [projectMilestones, projectLogs, projectLineItems, projectJsas, projectLeakNumbers, projectTaskNumbers, projectOmReports] = await Promise.all([
    db.select().from(milestones).where(eq(milestones.projectId, id)),
    db.select().from(dailyLogs).where(eq(dailyLogs.projectId, id)),
    db.select().from(lineItems).where(eq(lineItems.projectId, id)),
    db.select().from(jsaForms).where(eq(jsaForms.projectId, id)),
    db.select().from(leakNumbers).where(eq(leakNumbers.projectId, id)),
    db.select({ taskNumber: billingTasks.taskNumber }).from(billingTasks).where(eq(billingTasks.projectId, id)),
    isOm ? db.select().from(omReports).where(eq(omReports.projectId, id)) : Promise.resolve([] as typeof omReports.$inferSelect[]),
  ]);

  let budgetData: {
    expenses: typeof expenses.$inferSelect[];
    invoices: typeof invoices.$inferSelect[];
    payApps: typeof payApps.$inferSelect[];
    sovItems: typeof sovItems.$inferSelect[];
    sovEntries: typeof sovEntries.$inferSelect[];
    receipts: typeof receipts.$inferSelect[];
  } | null = null;
  let billingData: {
    billingRates: typeof billingRates.$inferSelect[];
    billingTasks: typeof billingTasks.$inferSelect[];
    tmInvoices: typeof tmInvoices.$inferSelect[];
  } | null = null;
  if (isAdmin) {
    const [projectExpenses, projectInvoices, projectPayApps, projectSovItems, projectSovEntries, projectReceipts] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.projectId, id)),
      db.select().from(invoices).where(eq(invoices.projectId, id)),
      db.select().from(payApps).where(eq(payApps.projectId, id)),
      db.select().from(sovItems).where(eq(sovItems.projectId, id)),
      db.select().from(sovEntries).where(eq(sovEntries.projectId, id)),
      db.select().from(receipts).where(eq(receipts.projectId, id)),
    ]);
    budgetData = {
      expenses: projectExpenses,
      invoices: projectInvoices,
      payApps: projectPayApps,
      sovItems: projectSovItems,
      sovEntries: projectSovEntries,
      receipts: projectReceipts,
    };

    if (isTm) {
      const [projectBillingRates, projectBillingTasks, projectTmInvoices] = await Promise.all([
        db.select().from(billingRates).where(eq(billingRates.projectId, id)),
        db.select().from(billingTasks).where(eq(billingTasks.projectId, id)),
        db.select().from(tmInvoices).where(eq(tmInvoices.projectId, id)),
      ]);
      billingData = {
        billingRates: projectBillingRates,
        billingTasks: projectBillingTasks,
        tmInvoices: projectTmInvoices,
      };
    }
  }

  const statusColor =
    project.status === "active"
      ? "var(--active)"
      : project.status === "upcoming"
        ? "var(--upcoming)"
        : project.status === "on_hold"
          ? "var(--hold, #b7791f)"
          : project.status === "canceled"
            ? "var(--danger)"
            : "var(--muted)";

  return (
    <div>
      <Link href="/board" style={{ display: "inline-block", marginBottom: 16, fontSize: "0.85rem", color: "var(--ink-soft)", textDecoration: "underline" }}>
        ← Back to Board
      </Link>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderLeft: `4px solid ${statusColor}`, borderRadius: 12, padding: "22px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <span
              style={{
                background: "var(--surface-2)",
                color: "var(--ink-soft)",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {project.status.replace("_", " ")}
            </span>
            {project.projectNumber ? (
              <span style={{ marginLeft: 8, color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "0.82rem", fontWeight: 600 }}>
                #{project.projectNumber}
              </span>
            ) : (
              (project.status === "active" || project.status === "upcoming") && (
                <span style={{ marginLeft: 8, background: "#ffe699", color: "#5c4400", borderRadius: 20, padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" }}>
                  No QuickBooks #
                </span>
              )
            )}
            <h1 style={{ fontSize: "1.6rem", marginTop: 6 }}>{project.name}</h1>
            {project.customer && <div style={{ color: "var(--ink-soft)", fontWeight: 600 }}>{project.customer}</div>}
            {project.location && <div style={{ color: "var(--muted)" }}>{project.location}</div>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 16, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <Fact label="Start Date" value={project.startDate || "—"} />
          <Fact label="Completion Date" value={project.endDate || "—"} />
          <Fact label="Duration" value={project.duration || "—"} />
          {!readOnly && <Fact label="Project Value" value={project.value ? `$${Number(project.value).toLocaleString()}` : "—"} />}
          <Fact label="Crew" value={project.crew?.length ? project.crew.join(", ") : "Unassigned"} />
        </div>
      </div>

      {isAdmin && !readOnly && budgetData && (
        <QuickBooksCard projectNumber={project.projectNumber} wb={whiteboardFigures(budgetData)} />
      )}

      {!readOnly && <div style={{ marginBottom: 20 }}>
        {isAdmin && budgetData ? (
          <>
          <BudgetSection
            projectId={id}
            contractValue={project.value}
            expenses={budgetData.expenses}
            invoices={budgetData.invoices}
            payApps={budgetData.payApps}
            sovItems={budgetData.sovItems}
            sovEntries={budgetData.sovEntries}
            receipts={budgetData.receipts.map((r) => ({
              id: r.id,
              date: r.date,
              vendor: r.vendor,
              amount: r.amount,
              category: r.category,
              lineItem: r.lineItem,
              note: r.note,
              aiAmount: r.aiAmount,
              submittedBy: r.submittedBy,
            }))}
          />
          <ProjectDocuments projectId={id} />
          <BidReference projectId={id} companyId={project.companyId} />
          </>
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 10 }}>Budget</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>🔒 Budget is visible to admins only.</p>
          </div>
        )}
      </div>}

      {isAdmin && isTm && billingData && (
        <div style={{ marginBottom: 20 }}>
          <BillingSection
            projectId={id}
            billingRates={billingData.billingRates}
            billingTasks={billingData.billingTasks}
            tmInvoices={billingData.tmInvoices}
          />
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <MilestoneSection projectId={id} milestones={projectMilestones} readOnly={readOnly} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <JsaSection projectId={id} jsas={projectJsas} people={people.names} usualCrews={people.usualCrews} readOnly={readOnly} />
      </div>

      {!readOnly && (
        <>
          <div style={{ marginBottom: 20 }}>
            <ReceiptSection projectId={id} billingType={project.billingType} lineItems={projectLineItems.map((li) => ({ itemNo: li.itemNo, description: li.description }))} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <EquipmentSection projectId={id} />
          </div>
        </>
      )}

      {isOm && (
        <div style={{ marginBottom: 20 }}>
          <OmReportSection
            projectId={id}
            reports={projectOmReports.map((r) => ({
              id: r.id,
              date: r.date,
              jobType: r.jobType,
              extras: r.extras || [],
              data: r.data || {},
              photos: r.photos || [],
              technician: r.technician,
              signature: r.signature,
              submittedBy: r.submittedBy,
              editedAt: r.editedAt ? r.editedAt.toISOString() : null,
              editedBy: r.editedBy,
            }))}
            isAdmin={isAdmin}
            readOnly={readOnly}
            people={people.names}
            defaultAddress={project.location || ""}
          />
        </div>
      )}

      <LogSection
        projectId={id}
        logs={projectLogs}
        lineItems={projectLineItems}
        leakNumbers={projectLeakNumbers
          .map((l) => ({ value: l.leakNumber, label: l.address ? `${l.leakNumber} — ${l.address}` : l.leakNumber }))
          .sort((a, b) => b.value.localeCompare(a.value, undefined, { numeric: true }))}
        taskNumbers={projectTaskNumbers.map((t) => t.taskNumber).sort()}
        people={people.names}
        usualCrews={people.usualCrews}
        isAdmin={isAdmin}
        readOnly={readOnly}
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, marginTop: 3 }}>{value}</div>
    </div>
  );
}
