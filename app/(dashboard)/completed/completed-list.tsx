"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { setProjectBilled } from "../board/actions";

type Project = {
  id: string;
  name: string;
  status: string;
  location: string | null;
  endDate: string | null;
  value: string | null;
  crew: string[] | null;
  billingType: string;
  projectNumber: string | null;
};

type Filter = "all" | "complete" | "billed";

export default function CompletedList({ projects, canEdit }: { projects: Project[]; canEdit: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, startTransition] = useTransition();
  const unbilled = projects.filter((p) => p.status === "complete").length;

  const sorted = useMemo(
    () =>
      projects
        .slice()
        .sort((a, b) => (b.endDate || "").localeCompare(a.endDate || "") || a.name.localeCompare(b.name)),
    [projects]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter(
      (p) =>
        (filter === "all" || p.status === filter) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          (p.projectNumber || "").toLowerCase().includes(q) ||
          (p.location || "").toLowerCase().includes(q))
    );
  }, [sorted, query, filter]);

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "complete", label: `Needs billing (${unbilled})` },
    { key: "billed", label: "Billed" },
  ];

  return (
    <div>
      <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", width: "fit-content", marginBottom: 14 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            style={{
              border: "none",
              padding: "8px 14px",
              fontWeight: 600,
              fontSize: "0.82rem",
              cursor: "pointer",
              background: filter === t.key ? "var(--rust)" : "var(--surface)",
              color: filter === t.key ? "var(--rust-ink)" : "var(--ink)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
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
            <div key={p.id} style={{ ...rowStyle, padding: 0 }}>
              <Link href={`/projects/${p.id}`} style={{ ...rowStyle, borderBottom: "none", flex: 1, minWidth: 0 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>
                    {p.projectNumber && <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{p.projectNumber} · </span>}
                    {p.name}
                    {p.billingType === "tm" && <span style={tmChipStyle}>T&amp;M</span>}
                    {p.status === "complete" && <span style={{ ...tmChipStyle, background: "#ffe699", color: "#5c4400" }}>Needs billing</span>}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{p.location}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.8rem" }}>Completed: {p.endDate || "—"}</div>
                  {p.value !== null && (
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                      {p.value ? `$${Number(p.value).toLocaleString()}` : "—"}
                    </div>
                  )}
                </div>
              </Link>
              {canEdit && (
                <button
                  disabled={pending}
                  onClick={() => startTransition(() => setProjectBilled(p.id, p.status !== "billed"))}
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--ink)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {p.status === "billed" ? "Undo billed" : "Mark billed"}
                </button>
              )}
            </div>
          ))
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", padding: "12px 0" }}>
            {projects.length ? "No projects match that filter or search." : "No completed projects yet."}
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
