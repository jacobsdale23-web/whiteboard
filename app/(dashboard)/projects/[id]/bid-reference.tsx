import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { opportunities, bidItems, estimateDetails, projects } from "@/lib/db/schema";
import { BID_CATEGORIES, bidItemTotal, computeEstimateSummary } from "@/lib/estimate";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { attachBid, detachBid } from "./bid-actions";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// The estimate this job was won on, kept with the project's budget for later reference (bid vs. what it actually
// cost). It reads the linked opportunity live, so it matches the Opportunities page. Admin-only, like the Budget.
export default async function BidReference({ projectId, companyId }: { projectId: string; companyId: string }) {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") return null;
  const linked = await db.query.opportunities.findFirst({ where: eq(opportunities.convertedProjectId, projectId) });

  if (!linked) {
    const won = (await db.select().from(opportunities).where(and(eq(opportunities.companyId, companyId), eq(opportunities.bidStatus, "Won")))).filter((o) => o.kind !== "Meeting");
    const linkedIds = won.map((o) => o.convertedProjectId).filter((x): x is string => !!x);
    const stillThere = linkedIds.length ? new Set((await db.select({ id: projects.id }).from(projects).where(inArray(projects.id, linkedIds))).map((p) => p.id)) : new Set<string>();
    // A won bid is free to attach unless its project still exists.
    const options = won.filter((o) => !o.convertedProjectId || !stillThere.has(o.convertedProjectId)).sort((a, b) => a.jobName.localeCompare(b.jobName));
    if (!options.length) return null;
    return (
      <div style={cardStyle}>
        <h3 style={headingStyle}>Original Bid</h3>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 10 }}>
          Attach the won bid this job came from, and its estimate will be kept here with the budget.
        </p>
        <form action={attachBid} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="hidden" name="projectId" value={projectId} />
          <select name="opportunityId" required defaultValue="" style={inputStyle}>
            <option value="" disabled>
              Choose a won bid…
            </option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.jobName}
                {o.customer ? ` · ${o.customer}` : ""}
                {o.bidValue ? ` · ${money(Number(o.bidValue))}` : ""}
              </option>
            ))}
          </select>
          <button type="submit" style={buttonStyle}>
            Attach bid
          </button>
        </form>
      </div>
    );
  }

  const [items, details] = await Promise.all([
    db.select().from(bidItems).where(eq(bidItems.opportunityId, linked.id)).orderBy(asc(bidItems.order)),
    db.query.estimateDetails.findFirst({ where: eq(estimateDetails.opportunityId, linked.id) }),
  ]);
  const summary = computeEstimateSummary(items, {
    overheadPercent: details?.overheadPercent ?? 0,
    profitPercent: details?.profitPercent ?? 0,
    contingencyPercent: details?.contingencyPercent ?? 0,
    salesTaxPercent: details?.salesTaxPercent ?? 0,
    bondInsuranceCost: details?.bondInsuranceCost ?? 0,
  });
  const awarded = linked.bidValue ? Number(linked.bidValue) : null;

  const categories = [...BID_CATEGORIES, ...Array.from(new Set(items.map((i) => i.category))).filter((c) => !BID_CATEGORIES.includes(c))];
  const groups = categories.map((c) => ({ category: c, rows: items.filter((i) => i.category === c) })).filter((g) => g.rows.length);
  const notes: [string, string | null | undefined][] = [
    ["Scope included", details?.scopeInclusions],
    ["Scope excluded", details?.scopeExclusions],
    ["Payment terms", details?.paymentTerms],
    ["Schedule", details?.scheduleDuration],
    ["Notes", details?.additionalNotes],
  ];

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h3 style={{ ...headingStyle, marginBottom: 2 }}>Original Bid</h3>
          <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
            {linked.jobName}
            {details?.bidNumber ? ` · Bid #${details.bidNumber}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href={`/opportunities/${linked.id}`} style={{ fontSize: "0.82rem", color: "var(--ink-soft)", textDecoration: "underline" }}>
            Open bid →
          </Link>
          <form action={detachBid}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="opportunityId" value={linked.id} />
            <button type="submit" title="Remove the link; the bid stays on the Opportunities page" style={{ ...buttonStyle, background: "none", border: "1px solid var(--border)", color: "var(--muted)" }}>
              Unlink
            </button>
          </form>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 12 }}>
        <Stat label="Awarded bid value" value={awarded === null ? "—" : money(awarded)} />
        <Stat label="Estimate total" value={items.length ? money(summary.totalBidPrice) : "No estimate"} />
        <Stat label="Direct cost" value={items.length ? money(summary.directCost) : "—"} />
        <Stat label="Overhead + profit + contingency" value={items.length ? money(summary.overheadAmount + summary.profitAmount + summary.contingencyAmount) : "—"} />
      </div>

      {items.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.88rem", marginBottom: 8 }}>Bid items ({items.length})</summary>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr>
                  {["Item", "Description", "Qty", "Unit", "Unit price", "Total"].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.category} category={g.category} rows={g.rows} />
                ))}
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                    Direct cost
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{money(summary.directCost)}</td>
                </tr>
                {[
                  ["Overhead", summary.overheadAmount],
                  ["Profit", summary.profitAmount],
                  ["Contingency", summary.contingencyAmount],
                  ["Bond / insurance", summary.bondInsuranceCost],
                  ["Sales tax", summary.salesTaxAmount],
                ].map(([label, amount]) =>
                  Number(amount) ? (
                    <tr key={String(label)}>
                      <td colSpan={5} style={{ ...tdStyle, textAlign: "right", color: "var(--muted)" }}>
                        {label}
                      </td>
                      <td style={tdStyle}>{money(Number(amount))}</td>
                    </tr>
                  ) : null
                )}
                <tr>
                  <td colSpan={5} style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                    Estimate total
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{money(summary.totalBidPrice)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      )}

      {notes.some(([, v]) => v && v.trim()) && (
        <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: "0.82rem" }}>
          {notes.map(([label, v]) =>
            v && v.trim() ? (
              <div key={label}>
                <span style={{ fontWeight: 700 }}>{label}: </span>
                <span style={{ color: "var(--ink-soft)", whiteSpace: "pre-wrap" }}>{v}</span>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

function GroupRows({ category, rows }: { category: string; rows: (typeof bidItems.$inferSelect)[] }) {
  return (
    <>
      <tr>
        <td colSpan={6} style={{ ...tdStyle, fontFamily: "inherit", fontWeight: 700, background: "var(--surface-2)" }}>
          {category}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.id}>
          <td style={tdStyle}>{r.itemNo}</td>
          <td style={{ ...tdStyle, fontFamily: "inherit" }}>{r.description}</td>
          <td style={tdStyle}>{Number(r.qty).toLocaleString("en-US")}</td>
          <td style={tdStyle}>{r.unit}</td>
          <td style={tdStyle}>{money(Number(r.unitPrice))}</td>
          <td style={tdStyle}>{money(bidItemTotal(r))}</td>
        </tr>
      ))}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.68rem", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, marginTop: 3 }}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginTop: 20 };
const headingStyle: React.CSSProperties = { fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 10 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit", minWidth: 260, maxWidth: "100%" };
const buttonStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "7px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: "0.66rem", textTransform: "uppercase", color: "var(--muted)", padding: "6px 9px", background: "var(--surface-2)" };
const tdStyle: React.CSSProperties = { padding: "6px 9px", fontFamily: "var(--font-mono)", borderBottom: "1px solid var(--border)" };
