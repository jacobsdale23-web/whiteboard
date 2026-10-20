"use client";

import { useRef, useState, useTransition } from "react";
import { addLog, deleteLog } from "./actions";
import { improveDescription } from "./ai-actions";

const POSITIONS = ["Foreman", "Operator", "Laborer", "Welder", "Fuser", "Flagger", "Drilling Crew Driller", "Drilling Crew Locator", "Locusview Tech"];

type LogEntry = {
  id: string;
  date: string;
  leakNumber: string;
  foreman: string | null;
  lineItem: string | null;
  crew: { name: string; position: string; hours: number }[] | null;
  description: string | null;
  address: string | null;
  taskNumber: string | null;
  locusviewNumber: string | null;
};
type LineItem = { itemNo: string; description: string | null };

type CrewRow = { key: number; name: string };

type Choice = { value: string; label: string };

function PickOrAdd({
  name,
  options,
  noneLabel,
  noneValue,
  newPlaceholder,
}: {
  name: string;
  options: Choice[];
  noneLabel: string;
  noneValue: string;
  newPlaceholder: string;
}) {
  const [value, setValue] = useState(noneValue);
  return (
    <>
      <select name={name} value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle}>
        <option value={noneValue}>{noneLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value="__new__">+ Add new…</option>
      </select>
      {value === "__new__" && (
        <input type="text" name={`${name}New`} required placeholder={newPlaceholder} style={{ ...inputStyle, marginTop: 6 }} />
      )}
    </>
  );
}

export default function LogSection({
  projectId,
  logs,
  lineItems,
  leakNumbers,
  taskNumbers,
  people,
  usualCrews,
}: {
  projectId: string;
  logs: LogEntry[];
  lineItems: LineItem[];
  leakNumbers: Choice[];
  taskNumbers: string[];
  people: string[];
  usualCrews: Record<string, string[]>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [foreman, setForeman] = useState("");
  const [crewRows, setCrewRows] = useState<CrewRow[]>([{ key: 0, name: "" }]);
  const [description, setDescription] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [improving, setImproving] = useState(false);
  const [aiError, setAiError] = useState("");
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [, startTransition] = useTransition();
  const sorted = logs.slice().sort((a, b) => b.date.localeCompare(a.date));
  const usual = usualCrews[foreman.trim().toLowerCase()] || [];

  function resetForm() {
    setShowForm(false);
    setForeman("");
    setCrewRows([{ key: 0, name: "" }]);
    setDescription("");
    setSuggestion("");
    setAiError("");
  }

  async function improve() {
    setAiError("");
    setSuggestion("");
    setImproving(true);
    try {
      const res = await improveDescription(projectId, description);
      if (res.error) setAiError(res.error);
      else if (res.improved) setSuggestion(res.improved);
    } catch {
      setAiError("The AI helper isn't available right now. You can still submit your description as written.");
    } finally {
      setImproving(false);
    }
  }

  function useSuggestion() {
    setDescription(suggestion);
    setSuggestion("");
    descRef.current?.setCustomValidity("");
  }

  // Suggests this foreman's usual crew; anyone can still be removed, renamed or added.
  function addUsualCrew() {
    setCrewRows((rows) => {
      const kept = rows.filter((r) => r.name.trim());
      const have = new Set(kept.map((r) => r.name.trim().toLowerCase()));
      let next = Math.max(0, ...rows.map((r) => r.key)) + 1;
      const added = usual.filter((n) => !have.has(n.toLowerCase())).map((n) => ({ key: next++, name: n }));
      const all = [...kept, ...added];
      return all.length ? all : [{ key: next, name: "" }];
    });
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
            <PickOrAdd name="leakNumber" options={leakNumbers} noneLabel="N/A" noneValue="N/A" newPlaceholder="New leak number" />
          </Field>
          <datalist id="people-list">
            {people.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <Field label="Foreman">
            <input
              type="text"
              name="foreman"
              list="people-list"
              autoComplete="off"
              placeholder="Pick a name or type a new one"
              required
              value={foreman}
              onChange={(e) => setForeman(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Task / Project Number">
              <PickOrAdd
                name="taskNumber"
                options={taskNumbers.map((t) => ({ value: t, label: t }))}
                noneLabel="— None —"
                noneValue=""
                newPlaceholder="New task number, e.g. 070.58526"
              />
            </Field>
            <Field label="Locusview Number">
              <input type="text" name="locusviewNumber" style={inputStyle} />
            </Field>
          </div>
          <Field label="Address">
            <input type="text" name="address" placeholder="Job site address" style={inputStyle} />
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
          {usual.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <button type="button" onClick={addUsualCrew} style={addBtnStyle}>
                + Add usual crew ({usual.length})
              </button>
              <span style={{ fontSize: "0.74rem", color: "var(--muted)", marginLeft: 8 }}>You can change anyone.</span>
            </div>
          )}
          {crewRows.map((row) => (
            <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 0.7fr auto", gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                name="crewName"
                list="people-list"
                autoComplete="off"
                placeholder="Pick or type a name"
                required
                value={row.name}
                onChange={(e) => setCrewRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)))}
                style={inputStyle}
              />
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
            onClick={() => setCrewRows((rows) => [...rows, { key: Math.max(0, ...rows.map((r) => r.key)) + 1, name: "" }])}
            style={{ ...addBtnStyle, marginBottom: 14 }}
          >
            + Add Crew Member
          </button>

          <Field label="Description of Work">
            <textarea
              ref={descRef}
              name="description"
              rows={4}
              required
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                e.currentTarget.setCustomValidity(e.currentTarget.value.trim() ? "" : "Please fill out this field.");
              }}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={improve} disabled={improving} style={addBtnStyle}>
                {improving ? "Improving…" : "✨ Improve with AI"}
              </button>
              <span style={{ fontSize: "0.74rem", color: "var(--muted)" }}>
                Fixes spelling and grammar and makes it sound professional. You review it before using it.
              </span>
            </div>
            {aiError && <p style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: 6 }}>{aiError}</p>}
            {suggestion && (
              <div style={{ marginTop: 10, border: "1px solid var(--active)", background: "var(--active-bg)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--active)", marginBottom: 6 }}>
                  Suggested version
                </div>
                <div style={{ fontSize: "0.88rem", whiteSpace: "pre-wrap", marginBottom: 10 }}>{suggestion}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={useSuggestion} style={primaryBtnStyle}>
                    Use this version
                  </button>
                  <button type="button" onClick={() => setSuggestion("")} style={secondaryBtnStyle}>
                    Keep mine
                  </button>
                </div>
              </div>
            )}
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
                  {l.taskNumber ? ` · Task #: ${l.taskNumber}` : ""}
                  {l.locusviewNumber ? ` · Locusview #: ${l.locusviewNumber}` : ""}
                  {l.lineItem ? ` · Item ${l.lineItem}${li?.description ? ` (${li.description})` : ""}` : ""}
                </div>
                {l.address && <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>{l.address}</div>}
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
