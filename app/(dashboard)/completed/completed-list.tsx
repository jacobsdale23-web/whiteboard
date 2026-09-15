"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type Project = {
  id: string;
  name: string;
  location: string | null;
  endDate: string | null;
  value: string | null;
  crew: string[] | null;
  billingType: string;
  projectNumber: string | null;
};

export default function CompletedList({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () =>
      projects
        .slice()
        .sort((a, b) => (b.endDate || "").localeCompare(a.endDate || "") || a.name.localeCompare(b.name)),
    [projects]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.projectNumber || "").toLowerCase().includes(q) ||
        (p.location || "").toLowerCase().includes(q)
    );
  }, [sorted, query]);

  return (
    <div>
      <input
        type="text"
        placeholder="Search by name, project number, or location…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ ...inputStyle, marginBottom: 16, maxWidth: 420 }}
      />

      <div style={cardStyle}>
        {filtered.length ? (
          filtered.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                  {p.projectNumber && <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{p.projectNumber} · </span>}
                  {p.name}
                  {p.billingType === "tm" && <span style={tmChipStyle}>T&amp;M</span>}
                </div>
                <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{p.location}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.8rem" }}>Completed: {p.endDate || "—"}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  {p.value ? `$${Number(p.value).toLocaleString()}` : "—"}
                </div>
              </div>
            </Link>
          ))
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", padding: "12px 0" }}>
            {projects.length ? "No completed projects match that search." : "No completed projects yet."}
          </p>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "9px 10px",
  fontSize: "0.88rem",
  color: "var(--ink)",
  fontFamily: "inherit",
  width: "100%",
};
const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "4px 20px" };
const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "14px 0",
  borderBottom: "1px solid var(--border)",
  color: "inherit",
  textDecoration: "none",
};
const tmChipStyle: React.CSSProperties = {
  marginLeft: 8,
  background: "var(--surface-2)",
  color: "var(--ink-soft)",
  fontSize: "0.68rem",
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 20,
  textTransform: "uppercase",
};
