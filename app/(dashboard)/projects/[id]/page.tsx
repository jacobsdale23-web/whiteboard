import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, milestones, dailyLogs, lineItems, expenses, invoices, payApps, sovItems, sovEntries, billingRates, billingTasks, tmInvoices } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import MilestoneSection from "./milestone-section";
import LogSection from "./log-section";
import BudgetSection from "./budget-section";
import BillingSection from "./billing-section";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) notFound();

  const current = await getSessionAndProfile();
  const isAdmin = current?.profile.role === "admin";
  const isTm = project.billingType === "tm";

  const [projectMilestones, projectLogs, projectLineItems] = await Promise.all([
    db.select().from(milestones).where(eq(milestones.projectId, id)),
    db.select().from(dailyLogs).where(eq(dailyLogs.projectId, id)),
    db.select().from(lineItems).where(eq(lineItems.projectId, id)),
  ]);

  let budgetData: {
    expenses: typeof expenses.$inferSelect[];
    invoices: typeof invoices.$inferSelect[];
    payApps: typeof payApps.$inferSelect[];
    sovItems: typeof sovItems.$inferSelect[];
    sovEntries: typeof sovEntries.$inferSelect[];
  } | null = null;
  let billingData: {
    billingRates: typeof billingRates.$inferSelect[];
    billingTasks: typeof billingTasks.$inferSelect[];
    tmInvoices: typeof tmInvoices.$inferSelect[];
  } | null = null;
  if (isAdmin) {
    const [projectExpenses, projectInvoices, projectPayApps, projectSovItems, projectSovEntries] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.projectId, id)),
      db.select().from(invoices).where(eq(invoices.projectId, id)),
      db.select().from(payApps).where(eq(payApps.projectId, id)),
      db.select().from(sovItems).where(eq(sovItems.projectId, id)),
      db.select().from(sovEntries).where(eq(sovEntries.projectId, id)),
    ]);
    budgetData = {
      expenses: projectExpenses,
      invoices: projectInvoices,
      payApps: projectPayApps,
      sovItems: projectSovItems,
      sovEntries: projectSovEntries,
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
    project.status === "active" ? "var(--active)" : project.status === "upcoming" ? "var(--upcoming)" : "var(--muted)";

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
              {project.status}
            </span>
            <h1 style={{ fontSize: "1.6rem", marginTop: 6 }}>{project.name}</h1>
            {project.location && <div style={{ color: "var(--muted)" }}>{project.location}</div>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 16, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <Fact label="Start Date" value={project.startDate || "—"} />
          <Fact label="Completion Date" value={project.endDate || "—"} />
          <Fact label="Duration" value={project.duration || "—"} />
          <Fact label="Project Value" value={project.value ? `$${Number(project.value).toLocaleString()}` : "—"} />
          <Fact label="Crew" value={project.crew?.length ? project.crew.join(", ") : "Unassigned"} />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        {isAdmin && budgetData ? (
          <BudgetSection
            projectId={id}
            contractValue={project.value}
            expenses={budgetData.expenses}
            invoices={budgetData.invoices}
            payApps={budgetData.payApps}
            sovItems={budgetData.sovItems}
            sovEntries={budgetData.sovEntries}
          />
        ) : (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 10 }}>Budget</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>🔒 Budget is visible to admins only.</p>
          </div>
        )}
      </div>

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
        <MilestoneSection projectId={id} milestones={projectMilestones} />
      </div>

      <LogSection projectId={id} logs={projectLogs} lineItems={projectLineItems} />
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
