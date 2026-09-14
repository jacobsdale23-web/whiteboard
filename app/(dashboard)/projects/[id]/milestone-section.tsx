"use client";

import { useState, useTransition } from "react";
import { addMilestone, deleteMilestone, toggleMilestone } from "./actions";

type Milestone = { id: string; name: string; date: string | null; done: boolean };

export default function MilestoneSection({ projectId, milestones }: { projectId: string; milestones: Milestone[] }) {
  const [showForm, setShowForm] = useState(false);
  const [, startTransition] = useTransition();
  const sorted = milestones.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  return (
    <div style={cardStyle}>
      <div style={headStyle}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Schedule</h3>
        <button onClick={() => setShowForm((s) => !s)} style={addBtnStyle}>
          + Add Milestone
        </button>
      </div>

      {showForm && (
        <form
          action={async (fd) => {
            await addMilestone(projectId, fd);
            setShowForm(false);
          }}
          style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}
        >
          <input type="text" name="name" placeholder="e.g. Excavation complete" required style={{ ...inputStyle, flex: 1 }} />
          <input type="date" name="date" style={inputStyle} />
          <button type="submit" style={addBtnStyle}>
            Add
          </button>
        </form>
      )}

      {sorted.length ? (
        sorted.map((m) => (
          <div key={m.id} style={rowStyle}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
              <input
                type="checkbox"
                defaultChecked={m.done}
                onChange={(e) => startTransition(() => toggleMilestone(projectId, m.id, e.target.checked))}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, textDecoration: m.done ? "line-through" : "none", color: m.done ? "var(--muted)" : "inherit" }}>
                  {m.name}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{m.date || "No date"}</div>
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm(`Delete "${m.name}"?`)) startTransition(() => deleteMilestone(projectId, m.id));
              }}
              style={deleteBtnStyle}
              title="Delete"
            >
              🗑
            </button>
          </div>
        ))
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No milestones yet.</p>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const headStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit" };
