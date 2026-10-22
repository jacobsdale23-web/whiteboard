"use client";

import { useState } from "react";
import Link from "next/link";

export type OqTask = { code: string; name: string; exams: { id: string; title: string; count: number }[] };

export default function OqList({ tasks, basePath = "/oq" }: { tasks: OqTask[]; basePath?: string }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? tasks.filter((t) => `${t.code} ${t.name} ${t.exams.map((e) => e.title).join(" ")}`.toLowerCase().includes(needle))
    : tasks;

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search tasks or exams (e.g. fusion, welding, F 03)"
        style={{ width: "100%", fontSize: "1rem", padding: "12px 14px", minHeight: 48, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)", marginBottom: 18, fontFamily: "inherit" }}
      />
      {shown.map((t) => (
        <div key={t.code} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>{t.code}</div>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>{t.name}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {t.exams.map((e) => (
              <Link
                key={e.id}
                href={`${basePath}/${e.id}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "var(--surface-2)", borderRadius: 10, padding: "14px 14px", minHeight: 52, color: "inherit", textDecoration: "none", fontWeight: 600 }}
              >
                <span>{e.title}</span>
                <span style={{ color: "var(--muted)", fontSize: "0.82rem", whiteSpace: "nowrap" }}>{e.count} questions ›</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
      {!shown.length && <p style={{ color: "var(--muted)" }}>No practice tests match that search.</p>}
    </div>
  );
}
