import Link from "next/link";
import { db } from "@/lib/db";
import { opportunities } from "@/lib/db/schema";
import OpportunityFormModal from "./opportunity-form-modal";
import StatusPill from "./status-pill";
import DeleteButton from "./delete-button";

type OpportunityRow = typeof opportunities.$inferSelect;

function byBidDueDate(a: OpportunityRow, b: OpportunityRow) {
  if (!a.bidDueDate) return 1;
  if (!b.bidDueDate) return -1;
  return a.bidDueDate < b.bidDueDate ? -1 : a.bidDueDate > b.bidDueDate ? 1 : 0;
}

export default async function OpportunitiesPage() {
  const rows = await db.select().from(opportunities);
  const active = rows.filter((o) => o.bidStatus !== "Lost" && o.bidStatus !== "Abandoned").sort(byBidDueDate);
  const archived = rows.filter((o) => o.bidStatus === "Lost" || o.bidStatus === "Abandoned").sort(byBidDueDate);

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>Opportunities ({active.length})</h2>
        <OpportunityFormModal />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {active.map((o) => (
          <OpportunityCard key={o.id} o={o} />
        ))}
        {!active.length && (
          <p style={{ color: "var(--muted)" }}>No opportunities yet. Add one with &ldquo;+ New Opportunity&rdquo;.</p>
        )}
      </div>

      {!!archived.length && (
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase" }}>
            Lost / Abandoned ({archived.length})
          </summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginTop: 14 }}>
            {archived.map((o) => (
              <OpportunityCard key={o.id} o={o} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function OpportunityCard({ o }: { o: OpportunityRow }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: `4px solid ${o.kind === "Meeting" ? "var(--shop)" : "var(--upcoming)"}`,
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div>
          <Link href={`/opportunities/${o.id}`} style={{ color: "inherit", textDecoration: "none" }}>
            <h3 style={{ fontSize: "1.05rem", textDecoration: "underline" }}>{o.jobName}</h3>
          </Link>
          <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{o.location}</div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <OpportunityFormModal opportunity={o} />
          <DeleteButton id={o.id} jobName={o.jobName} />
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        <Pill color={o.kind === "Meeting" ? "shop" : "upcoming"}>{o.kind}</Pill>
        <Pill color="neutral">{o.oppType}</Pill>
        <StatusPill
          id={o.id}
          jobName={o.jobName}
          bidValue={o.bidValue}
          bidStatus={o.bidStatus}
          alreadyConverted={!!o.convertedProjectId}
        />
      </div>

      <MetaRow label="Bid Due" value={o.bidDueDate || "—"} />
      <MetaRow label="Bid Value" value={o.bidValue ? `$${Number(o.bidValue).toLocaleString()}` : "—"} />
      <MetaRow label="Estimator" value={o.estimator || "—"} />
      <MetaRow label="Customer" value={o.customer || "—"} />
    </div>
  );
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  const map: Record<string, { bg: string; fg: string }> = {
    upcoming: { bg: "var(--upcoming-bg)", fg: "var(--upcoming)" },
    shop: { bg: "var(--shop-bg)", fg: "var(--shop)" },
    neutral: { bg: "var(--surface-2)", fg: "var(--ink-soft)" },
  };
  const c = map[color] || map.neutral;
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        borderRadius: 20,
        padding: "3px 10px",
        fontSize: "0.72rem",
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
      <span style={{ color: "var(--muted)", fontSize: "0.72rem", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
