import Link from "next/link";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { loadEquipmentHistory, formatDowntime } from "@/lib/equipment-history";

const URGENCY_LABEL: Record<string, string> = { down: "Down", repair_soon: "Repair soon", minor: "Minor" };
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
function when(d: Date | null): string {
  return d ? d.toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

export default async function EquipmentHistoryPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const current = await getSessionAndProfile();
  if (!current) return null;
  if (current.profile.role !== "admin") {
    return (
      <section>
        <h2 style={{ marginBottom: 8 }}>Equipment History</h2>
        <p style={{ color: "var(--muted)" }}>This page is for admins.</p>
      </section>
    );
  }

  const { q = "", status = "" } = await searchParams;
  const all = await loadEquipmentHistory();
  const needle = q.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (!status || r.status === status) &&
      (!needle || [r.equipment, r.project, r.reportedBy, r.resolvedBy || "", r.problem, r.resolution || ""].some((s) => s.toLowerCase().includes(needle)))
  );

  const resolved = all.filter((r) => r.hoursDown !== null);
  const totalCost = all.reduce((n, r) => n + r.partsCost, 0);
  const filteredCost = rows.reduce((n, r) => n + r.partsCost, 0);
  const avgHours = resolved.length ? resolved.reduce((n, r) => n + (r.hoursDown || 0), 0) / resolved.length : null;
  const repeats = Object.entries(
    all.reduce<Record<string, number>>((o, r) => ((o[r.equipment.trim().toLowerCase()] = (o[r.equipment.trim().toLowerCase()] || 0) + 1), o), {})
  )
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const exportHref = `/equipment/history/export${status || q ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}` : ""}`;

  return (
    <section>
      <Link href="/equipment" style={{ fontSize: "0.85rem", color: "var(--ink-soft)", textDecoration: "underline" }}>
        ← Back to Equipment Tickets
      </Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, margin: "12px 0 6px" }}>
        <h2>Equipment History &amp; Repair Log</h2>
        <a href={exportHref} style={{ ...btnStyle, textDecoration: "none" }}>
          Download CSV
        </a>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 16 }}>
        {all.length} ticket{all.length === 1 ? "" : "s"} · {resolved.length} resolved
        {avgHours !== null ? ` · average time to fix ${formatDowntime(avgHours)}` : ""}
        {totalCost > 0 ? ` · total parts cost ${money(totalCost)}` : ""}
        {(status || q) && totalCost > 0 ? ` (${money(filteredCost)} in this filter)` : ""}
        {repeats.length ? ` · repeat issues: ${repeats.map(([name, n]) => `${name} (${n})`).join(", ")}` : ""}
      </p>

      <form method="get" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input name="q" defaultValue={q} placeholder="Search equipment, project, mechanic, repair…" style={{ ...inputStyle, flex: "1 1 260px" }} />
        <select name="status" defaultValue={status} style={inputStyle}>
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <button type="submit" style={btnStyle}>
          Filter
        </button>
      </form>

      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr>
              {["Reported", "Equipment", "Project", "Problem", "Status", "Fixed", "Fixed by", "Downtime", "Parts cost", "What was done"].map((h) => (
                <th key={h} style={thStyle}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={tdStyle}>
                  {r.reportedDate}
                  <div style={{ color: "var(--muted)" }}>{r.reportedBy}</div>
                </td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{r.equipment}</td>
                <td style={tdStyle}>
                  <Link href={`/projects/${r.projectId}`} style={{ color: "inherit" }}>
                    {r.project}
                  </Link>
                </td>
                <td style={{ ...tdStyle, minWidth: 200 }}>
                  <div style={{ color: "var(--muted)" }}>{URGENCY_LABEL[r.urgency] || r.urgency}</div>
                  {r.problem}
                  {r.suspectedCause && <div style={{ color: "var(--muted)" }}>Possible cause: {r.suspectedCause}</div>}
                </td>
                <td style={tdStyle}>{STATUS_LABEL[r.status] || r.status}</td>
                <td style={tdStyle}>{when(r.resolvedAt)}</td>
                <td style={tdStyle}>{r.resolvedBy || ""}</td>
                <td style={tdStyle}>{formatDowntime(r.hoursDown)}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{r.partsCost ? money(r.partsCost) : ""}</td>
                <td style={{ ...tdStyle, minWidth: 220 }}>{r.resolution || ""}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={10} style={{ ...tdStyle, color: "var(--muted)" }}>
                  No tickets match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit" };
const btnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "8px 14px", borderRadius: 6, fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--border)", fontSize: "0.7rem", textTransform: "uppercase", color: "var(--muted)", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };
