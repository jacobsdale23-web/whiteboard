import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunities, bidItems, estimateDetails, planFiles } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import EstimateSection from "./estimate-section";
import PlanFilesSection from "./plan-files-section";

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const opportunity = await db.query.opportunities.findFirst({ where: eq(opportunities.id, id) });
  if (!opportunity) notFound();

  const current = await getSessionAndProfile();
  const isAdmin = current?.profile.role === "admin";

  return (
    <div>
      <Link href="/opportunities" style={{ display: "inline-block", marginBottom: 16, fontSize: "0.85rem", color: "var(--ink-soft)", textDecoration: "underline" }}>
        ← Back to Opportunities
      </Link>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "22px 24px", marginBottom: 20 }}>
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
          {opportunity.bidStatus}
        </span>
        <h1 style={{ fontSize: "1.6rem", marginTop: 6 }}>{opportunity.jobName}</h1>
        {opportunity.location && <div style={{ color: "var(--muted)" }}>{opportunity.location}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 16, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <Fact label="Customer" value={opportunity.customer || "—"} />
          <Fact label="Estimator" value={opportunity.estimator || "—"} />
          <Fact label="Bid Due" value={opportunity.bidDueDate || "—"} />
          <Fact label="Bid Value" value={opportunity.bidValue ? `$${Number(opportunity.bidValue).toLocaleString()}` : "—"} />
        </div>
      </div>

      {isAdmin ? (
        <EstimateSectionLoader opportunityId={id} />
      ) : (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 10 }}>Estimate</h3>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>🔒 Estimating is visible to admins only.</p>
        </div>
      )}
    </div>
  );
}

async function EstimateSectionLoader({ opportunityId }: { opportunityId: string }) {
  const [items, details, files] = await Promise.all([
    db.select().from(bidItems).where(eq(bidItems.opportunityId, opportunityId)),
    db.query.estimateDetails.findFirst({ where: eq(estimateDetails.opportunityId, opportunityId) }),
    db.select().from(planFiles).where(eq(planFiles.opportunityId, opportunityId)),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PlanFilesSection opportunityId={opportunityId} files={files} />
      <EstimateSection opportunityId={opportunityId} items={items} details={details ?? null} />
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
