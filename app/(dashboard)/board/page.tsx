import Link from "next/link";
import { db } from "@/lib/db";
import { projects, crew } from "@/lib/db/schema";
import ProjectFormModal from "./project-form-modal";

export default async function BoardPage() {
  const allProjects = await db.select().from(projects);
  const allCrew = await db.select().from(crew);

  const active = allProjects.filter((p) => p.status === "active");
  const upcoming = allProjects.filter((p) => p.status === "upcoming");
  // Individual crew workers (e.g. Jackson's T&M roster) stay in the crew
  // table for daily-log entry, but only foremen are ever displayed here.
  const foremen = allCrew.filter((c) => c.role === "foreman");
  const assignedNames = new Set(active.flatMap((p) => p.crew || []));
  const atShop = foremen.filter((c) => !assignedNames.has(c.name));

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
        <ProjectFormModal crewList={foremen} />
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 12 }}>Active Projects ({active.length})</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {active.map((p) => (
            <div key={p.id} style={{ position: "relative" }}>
              <Link href={`/projects/${p.id}`} style={cardStyle}>
                <h3 style={{ fontSize: "1rem", paddingRight: 24 }}>{p.name}</h3>
                <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{p.location}</div>
                <div style={{ marginTop: 8, fontSize: "0.85rem" }}>Completion: {p.endDate || "—"}</div>
                <div style={{ fontSize: "0.85rem" }}>
                  Value: {p.value ? `$${Number(p.value).toLocaleString()}` : "—"}
                </div>
                <div style={{ fontSize: "0.85rem" }}>Crew: {(p.crew || []).join(", ") || "Unassigned"}</div>
              </Link>
              <div style={{ position: "absolute", top: 14, right: 14 }}>
                <ProjectFormModal project={p} crewList={foremen} />
              </div>
            </div>
          ))}
          {!active.length && <p style={{ color: "var(--muted)" }}>No active projects yet.</p>}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ marginBottom: 12 }}>Upcoming Projects ({upcoming.length})</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {upcoming.map((p) => (
            <div key={p.id} style={{ position: "relative" }}>
              <Link href={`/projects/${p.id}`} style={cardStyle}>
                <h3 style={{ fontSize: "1rem", paddingRight: 24 }}>{p.name}</h3>
                <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{p.location}</div>
                <div style={{ marginTop: 8, fontSize: "0.85rem" }}>Start: {p.startDate || "TBD"}</div>
                <div style={{ fontSize: "0.85rem" }}>
                  Value: {p.value ? `$${Number(p.value).toLocaleString()}` : "—"}
                </div>
              </Link>
              <div style={{ position: "absolute", top: 14, right: 14 }}>
                <ProjectFormModal project={p} crewList={foremen} />
              </div>
            </div>
          ))}
          {!upcoming.length && <p style={{ color: "var(--muted)" }}>Nothing upcoming yet.</p>}
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: 12 }}>The Shop ({atShop.length})</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {atShop.map((c) => (
            <span key={c.id} style={chipStyle}>
              {c.name}
            </span>
          ))}
          {!atShop.length && <p style={{ color: "var(--muted)" }}>Everyone is out on a job.</p>}
        </div>
      </section>
    </>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: 16,
  color: "inherit",
  textDecoration: "none",
  display: "block",
};

const chipStyle: React.CSSProperties = {
  background: "var(--shop-bg)",
  color: "var(--shop)",
  padding: "6px 12px",
  borderRadius: 20,
  fontSize: "0.85rem",
  fontWeight: 600,
};
