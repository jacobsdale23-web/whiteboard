"use client";

import { useState, useTransition } from "react";
import { addJsa, deleteJsa, acknowledgeJsa } from "./jsa-actions";
import { TASK_TYPES, PPE_ITEMS, HAZARD_LIBRARY } from "@/lib/jsa-library";

type JsaHazard = { taskType: string; hazard: string; control: string };
type JsaCrewMember = { name: string; acknowledgedAt: string | null };
type Jsa = {
  id: string;
  date: string;
  foreman: string | null;
  weather: string | null;
  taskTypes: string[] | null;
  hazards: JsaHazard[] | null;
  ppe: string[] | null;
  additionalHazards: string | null;
  emergencyInfo: string | null;
  crew: JsaCrewMember[] | null;
};

type CrewRow = { key: number };

export default function JsaSection({ projectId, jsas }: { projectId: string; jsas: Jsa[] }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedTaskTypes, setSelectedTaskTypes] = useState<string[]>([]);
  const [crewRows, setCrewRows] = useState<CrewRow[]>([{ key: 0 }]);
  const sorted = jsas.slice().sort((a, b) => b.date.localeCompare(a.date));

  function resetForm() {
    setShowForm(false);
    setSelectedTaskTypes([]);
    setCrewRows([{ key: 0 }]);
  }

  function toggleTaskType(t: string) {
    setSelectedTaskTypes((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  }

  return (
    <div style={cardStyle}>
      <div style={headStyle}>
        <div>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Daily JSA</h3>
          <p style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>Job Safety Analysis — complete before work starts</p>
        </div>
        <button onClick={() => setShowForm((s) => !s)} style={addBtnStyle}>
          + New JSA
        </button>
      </div>

      {showForm && (
        <form
          action={async (fd) => {
            await addJsa(projectId, fd);
            resetForm();
          }}
          style={{ marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 16 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Date">
              <input type="date" name="date" required style={inputStyle} defaultValue={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field label="Foreman">
              <input type="text" name="foreman" required style={inputStyle} />
            </Field>
          </div>
          <Field label="Weather Conditions">
            <input type="text" name="weather" placeholder="e.g. Clear, 78°F" style={inputStyle} />
          </Field>

          <label style={labelStyle}>Work Being Performed Today</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 6, marginBottom: 14 }}>
            {TASK_TYPES.map((t) => (
              <label key={t} style={checkboxLabelStyle}>
                <input type="checkbox" name="taskTypes" value={t} checked={selectedTaskTypes.includes(t)} onChange={() => toggleTaskType(t)} />
                {t}
              </label>
            ))}
          </div>

          {selectedTaskTypes.map((t) => (
            <div key={t} style={{ marginBottom: 14, border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, marginBottom: 8 }}>{t} — Hazards Present Today</div>
              {(HAZARD_LIBRARY[t] || []).map((h) => (
                <label key={h.hazard} style={{ ...checkboxLabelStyle, alignItems: "flex-start", marginBottom: 8 }}>
                  <input type="checkbox" name="hazard" value={`${t}||${h.hazard}`} style={{ marginTop: 3 }} />
                  <span>
                    <div style={{ fontWeight: 600 }}>{h.hazard}</div>
                    <div style={{ color: "var(--muted)", fontSize: "0.78rem" }}>Control: {h.control}</div>
                  </span>
                </label>
              ))}
            </div>
          ))}

          <label style={labelStyle}>PPE Required Today</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 6, marginBottom: 14 }}>
            {PPE_ITEMS.map((p) => (
              <label key={p} style={checkboxLabelStyle}>
                <input type="checkbox" name="ppe" value={p} />
                {p}
              </label>
            ))}
          </div>

          <Field label="Additional Site-Specific Hazards / Notes">
            <textarea name="additionalHazards" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
          <Field label="Emergency Info (nearest hospital / address)">
            <input type="text" name="emergencyInfo" style={inputStyle} />
          </Field>

          <label style={labelStyle}>Crew Present (each will initial on-site)</label>
          {crewRows.map((row, i) => (
            <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 }}>
              <input type="text" name="crewName" placeholder="Crew member name" required style={inputStyle} />
              <button
                type="button"
                onClick={() => setCrewRows((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== row.key) : rows))}
                style={{ ...deleteBtnStyle, justifySelf: "center" }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCrewRows((rows) => [...rows, { key: Math.max(0, ...rows.map((r) => r.key)) + 1 }])}
            style={{ ...addBtnStyle, marginBottom: 14 }}
          >
            + Add Crew Member
          </button>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={resetForm} style={secondaryBtnStyle}>
              Cancel
            </button>
            <button type="submit" style={primaryBtnStyle}>
              Submit JSA
            </button>
          </div>
        </form>
      )}

      {sorted.length ? (
        sorted.map((j) => <JsaCard key={j.id} projectId={projectId} jsa={j} />)
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No JSAs submitted yet.</p>
      )}
    </div>
  );
}

function JsaCard({ projectId, jsa }: { projectId: string; jsa: Jsa }) {
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const crew = jsa.crew || [];
  const acknowledgedCount = crew.filter((c) => c.acknowledgedAt).length;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
            {jsa.date} · {jsa.foreman}
          </div>
          <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
            {(jsa.taskTypes || []).join(", ") || "No task types selected"}
            {jsa.weather ? ` · ${jsa.weather}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!!crew.length && (
            <span style={{ ...chipStyle, background: acknowledgedCount === crew.length ? "var(--active-bg, #e8f5e9)" : "var(--surface-2)" }}>
              ✓ {acknowledgedCount}/{crew.length} initialed
            </span>
          )}
          <button onClick={() => setExpanded((s) => !s)} style={addBtnStyle}>
            {expanded ? "Hide" : "View"}
          </button>
          <button
            onClick={() => {
              if (confirm("Delete this JSA?")) startTransition(() => deleteJsa(projectId, jsa.id));
            }}
            style={deleteBtnStyle}
          >
            🗑
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          {!!(jsa.hazards || []).length && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Hazards & Controls</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.82rem" }}>
                {(jsa.hazards || []).map((h, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <strong>{h.hazard}</strong> ({h.taskType}) — {h.control}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!(jsa.ppe || []).length && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>PPE Required</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {(jsa.ppe || []).map((p) => (
                  <span key={p} style={chipStyle}>
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {jsa.additionalHazards && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Additional Hazards / Notes</div>
              <p style={{ fontSize: "0.85rem", margin: 0 }}>{jsa.additionalHazards}</p>
            </div>
          )}

          {jsa.emergencyInfo && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Emergency Info</div>
              <p style={{ fontSize: "0.85rem", margin: 0 }}>{jsa.emergencyInfo}</p>
            </div>
          )}

          {!!crew.length && (
            <div>
              <div style={labelStyle}>Crew Acknowledgment</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {crew.map((c, i) => (
                  <button
                    key={i}
                    disabled={!!c.acknowledgedAt}
                    onClick={() => startTransition(() => acknowledgeJsa(projectId, jsa.id, i))}
                    style={{
                      ...chipStyle,
                      border: "1px solid var(--border)",
                      cursor: c.acknowledgedAt ? "default" : "pointer",
                      background: c.acknowledgedAt ? "var(--active-bg, #e8f5e9)" : "var(--surface-2)",
                      color: c.acknowledgedAt ? "var(--active, #2e7d32)" : "var(--ink)",
                    }}
                  >
                    {c.acknowledgedAt ? `✓ ${c.name}` : `Tap to initial — ${c.name}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const headStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit", width: "100%" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 };
const checkboxLabelStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, fontSize: "0.83rem", fontWeight: 400, textTransform: "none" };
const chipStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-soft)", fontSize: "0.76rem", padding: "3px 9px", borderRadius: 20 };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
