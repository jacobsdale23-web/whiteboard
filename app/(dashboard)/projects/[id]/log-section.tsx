"use client";

import { useState, useTransition } from "react";
import { addLog, deleteLog } from "./actions";

const POSITIONS = ["Operator", "Laborer", "Welder", "Locusview Tech"];

type LogEntry = {
  id: string;
  date: string;
  leakNumber: string;
  foreman: string | null;
  lineItem: string | null;
  crew: { name: string; position: string; hours: number }[] | null;
  description: string | null;
};
type LineItem = { itemNo: string; description: string | null };

type CrewRow = { key: number };

export default function LogSection({
  projectId,
  logs,
  lineItems,
}: {
  projectId: string;
  logs: LogEntry[];
  lineItems: LineItem[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [crewRows, setCrewRows] = useState<CrewRow[]>([{ key: 0 }]);
  const [, startTransition] = useTransition();
  const sorted = logs.slice().sort((a, b) => b.date.localeCompare(a.date));

  function resetForm() {
    setShowForm(false);
    setCrewRows([{ key: 0 }]);
  }

  return (
    <div style={cardStyle}>
      <div style={headStyle}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Daily Logs</h3>
        <button onClick={() => setShowForm((s) => !s)} style={addBtnStyle}>
          + Add Entry
        </button>
      </div>

      {showForm && (
        <form
          action={async (fd) => {
            await addLog(projectId, fd);
            resetForm();
          }}
          style={{ marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 16 }}
        >
          <Field label="Date">
            <input type="date" name="date" required style={inputStyle} defaultValue={new Date().toISOString().slice(0, 10)} />
          </Field>
          <Field label="Leak Number">
            <input type="text" name="leakNumber" placeholder="N/A" style={inputStyle} />
          </Field>
          <Field label="Foreman">
            <input type="text" name="foreman" required style={inputStyle} />
          </Field>
          <Field label="Line Item">
            <select name="lineItem" style={inputStyle} defaultValue="">
              <option value="">— No line item —</option>
              {lineItems
                .slice()
                .sort((a, b) => a.itemNo.localeCompare(b.itemNo))
                .map((li) => (
                  <option key={li.itemNo} value={li.itemNo}>
                    {li.itemNo} — {li.description}
                  </option>
                ))}
            </select>
          </Field>

          <label style={labelStyle}>Crew</label>
          {crewRows.map((row, i) => (
            <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 0.7fr auto", gap: 8, marginBottom: 8 }}>
              <input type="text" name="crewName" placeholder="Crew member" required style={inputStyle} />
              <select name="crewPosition" style={inputStyle} defaultValue="Operator">
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input type="number" name="crewHours" placeholder="Hours" min="0" step="0.25" required style={inputStyle} />
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

          <Field label="Description of Work">
            <textarea name="description" rows={4} required style={{ ...inputStyle, resize: "vertical" }} />
          </Field>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={resetForm} style={secondaryBtnStyle}>
              Cancel
            </button>
            <button type="submit" style={primaryBtnStyle}>
              Add
            </button>
          </div>
        </form>
      )}

      {sorted.length ? (
        sorted.map((l) => {
          const li = l.lineItem ? lineItems.find((x) => x.itemNo === l.lineItem) : null;
          return (
            <div key={l.id} style={rowStyle}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--muted)" }}>{l.date}</div>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--ink-soft)" }}>
                  Leak #: {l.leakNumber}
                  {l.foreman ? ` · Foreman: ${l.foreman}` : ""}
                  {l.lineItem ? ` · Item ${l.lineItem}${li?.description ? ` (${li.description})` : ""}` : ""}
                </div>
                {!!l.crew?.length && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                    {l.crew.map((c, i) => (
                      <span key={i} style={chipStyle}>
                        {c.name} · {c.position} · {c.hours}h
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: "0.85rem", marginTop: 6 }}>{l.description}</div>
              </div>
              <button
                onClick={() => {
                  if (confirm("Delete this log entry?")) startTransition(() => deleteLog(projectId, l.id));
                }}
                style={deleteBtnStyle}
                title="Delete"
              >
                🗑
              </button>
            </div>
          );
        })
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No daily logs yet.</p>
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
const headStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "12px 0", borderBottom: "1px solid var(--border)" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit", width: "100%" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 };
const chipStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink-soft)", fontSize: "0.76rem", padding: "3px 9px", borderRadius: 20 };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
