"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ProjectFormModal from "./project-form-modal";

type BoardProject = {
  id: string;
  name: string;
  location: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  value: string | null;
  crew: string[] | null;
  billingType: string;
  projectNumber: string | null;
  customer: string | null;
};
type CompletedProject = { id: string; name: string; projectNumber: string | null; location: string | null; customer: string | null; endDate: string | null };
type CrewMember = { id: string; name: string };

const MAX_COMPLETED_SHOWN = 30;

function matches(query: string, ...fields: (string | null | undefined | string[])[]): boolean {
  const hay = fields
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

export default function BoardView({
  active,
  upcoming,
  completed,
  foremen,
  atShop,
  readOnly = false,
}: {
  active: BoardProject[];
  upcoming: BoardProject[];
  completed: CompletedProject[];
  foremen: CrewMember[];
  atShop: CrewMember[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const searching = q.trim().length > 0;

  const shown = useMemo(() => {
    if (!searching) return { active, upcoming, completed: [] as CompletedProject[], completedTotal: 0 };
    const a = active.filter((p) => matches(q, p.name, p.projectNumber, p.location, p.customer, p.crew));
    const u = upcoming.filter((p) => matches(q, p.name, p.projectNumber, p.location, p.customer, p.crew));
    const c = completed.filter((p) => matches(q, p.name, p.projectNumber, p.location, p.customer));
    return { active: a, upcoming: u, completed: c.slice(0, MAX_COMPLETED_SHOWN), completedTotal: c.length };
  }, [q, searching, active, upcoming, completed]);

  const totalMatches = shown.active.length + shown.upcoming.length + shown.completedTotal;

  function onEnter() {
    if (!searching) return;
    const first = shown.active[0] || shown.upcoming[0] || shown.completed[0];
    if (totalMatches === 1 && first) router.push(`/projects/${first.id}`);
  }

  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 280px" }}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEnter();
              if (e.key === "Escape") setQ("");
            }}
            placeholder="Search projects by name, number, location, customer or crew"
            aria-label="Search projects"
            autoComplete="off"
            style={{ width: "100%", fontSize: "1rem", padding: "12px 40px 12px 14px", minHeight: 48, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit" }}
          />
          {searching && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              style={{ position: "absolute", right: 6, top: 6, width: 36, height: 36, border: "none", background: "none", fontSize: "1.2rem", color: "var(--muted)", cursor: "pointer" }}
            >
              ×
            </button>
          )}
        </div>
        {!readOnly && <ProjectFormModal crewList={foremen} />}
      </div>

      {searching && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: 16 }}>
          {totalMatches ? `${totalMatches} project${totalMatches === 1 ? "" : "s"} match “${q.trim()}”` : `No projects match “${q.trim()}”.`}
        </p>
      )}

      {(!searching || shown.active.length > 0) && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 12 }}>
            Active Projects ({searching ? `${shown.active.length} of ${active.length}` : active.length})
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {shown.active.map((p) => (
              <div key={p.id} style={{ position: "relative" }}>
                <Link href={`/projects/${p.id}`} style={cardStyle}>
                  <h3 style={{ fontSize: "1rem", paddingRight: 24 }}>
                    {p.projectNumber && <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{p.projectNumber} · </span>}
                    {p.name}
                  </h3>
                  <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{p.location}</div>
                  <div style={{ marginTop: 8, fontSize: "0.85rem" }}>Completion: {p.endDate || "—"}</div>
                  {!readOnly && <div style={{ fontSize: "0.85rem" }}>Value: {p.value ? `$${Number(p.value).toLocaleString()}` : "—"}</div>}
                  <div style={{ fontSize: "0.85rem" }}>Crew: {(p.crew || []).join(", ") || "Unassigned"}</div>
                </Link>
                {!readOnly && (
                  <div style={{ position: "absolute", top: 14, right: 14 }}>
                    <ProjectFormModal project={p} crewList={foremen} />
                  </div>
                )}
              </div>
            ))}
            {!active.length && <p style={{ color: "var(--muted)" }}>No active projects yet.</p>}
          </div>
        </section>
      )}

      {(!searching || shown.upcoming.length > 0) && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 12 }}>
            Upcoming Projects ({searching ? `${shown.upcoming.length} of ${upcoming.length}` : upcoming.length})
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {shown.upcoming.map((p) => (
              <div key={p.id} style={{ position: "relative" }}>
                <Link href={`/projects/${p.id}`} style={cardStyle}>
                  <h3 style={{ fontSize: "1rem", paddingRight: 24 }}>{p.name}</h3>
                  <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{p.location}</div>
                  <div style={{ marginTop: 8, fontSize: "0.85rem" }}>Start: {p.startDate || "TBD"}</div>
                  {!readOnly && <div style={{ fontSize: "0.85rem" }}>Value: {p.value ? `$${Number(p.value).toLocaleString()}` : "—"}</div>}
                </Link>
                {!readOnly && (
                  <div style={{ position: "absolute", top: 14, right: 14 }}>
                    <ProjectFormModal project={p} crewList={foremen} />
                  </div>
                )}
              </div>
            ))}
            {!upcoming.length && <p style={{ color: "var(--muted)" }}>Nothing upcoming yet.</p>}
          </div>
        </section>
      )}

      {searching && shown.completed.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ marginBottom: 12 }}>Completed Projects ({shown.completedTotal})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
            {shown.completed.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} style={{ ...cardStyle, opacity: 0.9 }}>
                <h3 style={{ fontSize: "1rem" }}>
                  {p.projectNumber && <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{p.projectNumber} · </span>}
                  {p.name}
                </h3>
                <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{p.location}</div>
                {p.customer && <div style={{ fontSize: "0.85rem" }}>{p.customer}</div>}
                <div style={{ marginTop: 6, fontSize: "0.82rem", color: "var(--muted)" }}>Finished: {p.endDate || "—"}</div>
              </Link>
            ))}
          </div>
          {shown.completedTotal > shown.completed.length && (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 10 }}>
              Showing the first {shown.completed.length} of {shown.completedTotal}. Type a little more to narrow it down.
            </p>
          )}
        </section>
      )}

      {!searching && (
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
      )}
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
