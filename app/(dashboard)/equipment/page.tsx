import Link from "next/link";
import { db } from "@/lib/db";
import { equipmentTickets, projects } from "@/lib/db/schema";
import { getSessionAndProfile, canSeeEquipment } from "@/lib/auth/current-user";
import TicketControls from "./ticket-controls";

type Ticket = typeof equipmentTickets.$inferSelect;

const URGENCY_ORDER: Record<string, number> = { down: 0, repair_soon: 1, minor: 2 };
const URGENCY_LABEL: Record<string, string> = { down: "Down", repair_soon: "Repair soon", minor: "Minor" };
const URGENCY_COLOR: Record<string, { bg: string; fg: string }> = {
  down: { bg: "var(--danger-bg)", fg: "var(--danger)" },
  repair_soon: { bg: "var(--shop-bg)", fg: "var(--shop)" },
  minor: { bg: "var(--surface-2)", fg: "var(--ink-soft)" },
};
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

export default async function EquipmentPage() {
  const current = await getSessionAndProfile();
  if (!current) return null;

  // Real access check — hiding the nav link alone would not protect this page.
  if (!canSeeEquipment(current.profile)) {
    return (
      <section>
        <h2 style={{ marginBottom: 8 }}>Equipment</h2>
        <p style={{ color: "var(--muted)" }}>This page is for mechanics and admins.</p>
      </section>
    );
  }

  const [tickets, allProjects] = await Promise.all([db.select().from(equipmentTickets), db.select().from(projects)]);
  const projectById = new Map(allProjects.map((p) => [p.id, p]));

  const active = tickets
    .filter((t) => t.status !== "resolved")
    .sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9) || a.createdAt.getTime() - b.createdAt.getTime());
  const resolved = tickets
    .filter((t) => t.status === "resolved")
    .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0))
    .slice(0, 30);
  const downCount = active.filter((t) => t.urgency === "down").length;

  return (
    <section>
      <h2 style={{ marginBottom: 6 }}>Equipment Tickets</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 18 }}>
        {active.length
          ? `${active.length} open${downCount ? ` — ${downCount} down` : ""}. Downed equipment is listed first.`
          : "Nothing waiting. Foremen file tickets from the Equipment Issue section on a project."}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
        {active.map((t) => (
          <TicketCard key={t.id} t={t} project={projectById.get(t.projectId)} />
        ))}
      </div>

      {!!resolved.length && (
        <details style={{ marginTop: 28 }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: "0.85rem", fontWeight: 600, textTransform: "uppercase" }}>
            Recently resolved ({resolved.length})
          </summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14, marginTop: 14 }}>
            {resolved.map((t) => (
              <TicketCard key={t.id} t={t} project={projectById.get(t.projectId)} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function TicketCard({ t, project }: { t: Ticket; project: typeof projects.$inferSelect | undefined }) {
  const c = URGENCY_COLOR[t.urgency] || URGENCY_COLOR.minor;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderLeft: `4px solid ${c.fg}`,
        borderRadius: 10,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <h3 style={{ fontSize: "1.05rem" }}>{t.equipment}</h3>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <Badge bg={c.bg} fg={c.fg}>
            {URGENCY_LABEL[t.urgency] || t.urgency}
          </Badge>
          <Badge bg="var(--surface-2)" fg="var(--ink-soft)">
            {STATUS_LABEL[t.status] || t.status}
          </Badge>
        </div>
      </div>
      <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
        {project ? (
          <Link href={`/projects/${project.id}`} style={{ color: "inherit" }}>
            {project.projectNumber ? `${project.projectNumber} · ` : ""}
            {project.name}
          </Link>
        ) : (
          "Unknown project"
        )}
        {project?.location ? ` — ${project.location}` : ""}
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
        Reported by {t.reportedBy} on {t.date}
      </div>
      <div style={{ fontSize: "0.88rem", marginTop: 4 }}>
        <strong>Problem:</strong> {t.problem}
      </div>
      {t.suspectedCause && (
        <div style={{ fontSize: "0.88rem" }}>
          <strong>Possible cause:</strong> {t.suspectedCause}
        </div>
      )}
      <TicketControls id={t.id} status={t.status} mechanicNotes={t.mechanicNotes} />
    </div>
  );
}

function Badge({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return (
    <span style={{ background: bg, color: fg, borderRadius: 20, padding: "3px 10px", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
