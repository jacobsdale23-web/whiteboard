"use client";

import { useId, useRef, useState, useTransition } from "react";
import { addLog, deleteLog, updateLog } from "./actions";
import { improveDescription } from "./ai-actions";

import { POSITIONS } from "@/lib/positions";
import { byItemNo, fmtQty } from "@/lib/production";

type LogEntry = {
  id: string;
  date: string;
  leakNumber: string;
  foreman: string | null;
  lineItem: string | null;
  quantities: { itemNo: string; qty: number }[] | null;
  scopeChange: boolean;
  crew: { name: string; position: string; hours: number }[] | null;
  description: string | null;
  address: string | null;
  taskNumber: string | null;
  locusviewNumber: string | null;
  editedAt: Date | null;
  editedBy: string | null;
};
type LineItem = { itemNo: string; description: string | null; unit: string | null };
type Choice = { value: string; label: string };
type CrewRow = { key: number; name: string; position: string; hours: string };
type QtyRow = { key: number; itemNo: string; qty: string };

const today = () => new Date().toISOString().slice(0, 10);

function PickOrAdd({
  name,
  options,
  noneLabel,
  noneValue,
  newPlaceholder,
  initial,
}: {
  name: string;
  options: Choice[];
  noneLabel: string;
  noneValue: string;
  newPlaceholder: string;
  initial?: string;
}) {
  const [value, setValue] = useState(initial ?? noneValue);
  // Editing an old log: keep its value selectable even if it isn't in the saved list.
  const all = initial && initial !== noneValue && !options.some((o) => o.value === initial) ? [{ value: initial, label: initial }, ...options] : options;
  return (
    <>
      <select name={name} value={value} onChange={(e) => setValue(e.target.value)} style={inputStyle}>
        <option value={noneValue}>{noneLabel}</option>
        {all.map((o) => (
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

function LogForm({
  projectId,
  initial,
  lineItems,
  leakNumbers,
  taskNumbers,
  people,
  usualCrews,
  production,
  billedThrough,
  hasQuote,
  onDone,
}: {
  projectId: string;
  initial?: LogEntry;
  lineItems: LineItem[];
  leakNumbers: Choice[];
  taskNumbers: string[];
  people: string[];
  usualCrews: Record<string, string[]>;
  production: boolean;
  billedThrough: string | null;
  hasQuote: boolean;
  onDone: () => void;
}) {
  const editing = !!initial;
  const listId = useId();
  const [date, setDate] = useState(initial?.date || today());
  const [qtyRows, setQtyRows] = useState<QtyRow[]>((initial?.quantities || []).map((q, i) => ({ key: i, itemNo: q.itemNo, qty: String(q.qty) })));
  const sortedItems = lineItems.slice().sort((a, b) => byItemNo(a.itemNo, b.itemNo));
  const itemLabel = (li: LineItem) => `${li.itemNo} — ${li.description || ""}${li.unit ? ` (${li.unit})` : ""}`;
  const [foreman, setForeman] = useState(initial?.foreman || "");
  const [crewRows, setCrewRows] = useState<CrewRow[]>(
    initial?.crew?.length
      ? initial.crew.map((c, i) => ({ key: i, name: c.name, position: c.position || "Operator", hours: String(c.hours) }))
      : [{ key: 0, name: "", position: "Operator", hours: "" }]
  );
  const [description, setDescription] = useState(initial?.description || "");
  const [suggestion, setSuggestion] = useState("");
  const [improving, setImproving] = useState(false);
  const [aiError, setAiError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const usual = usualCrews[foreman.trim().toLowerCase()] || [];

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
      const added = usual.filter((n) => !have.has(n.toLowerCase())).map((n) => ({ key: next++, name: n, position: "Operator", hours: "" }));
      const all = [...kept, ...added];
      return all.length ? all : [{ key: next, name: "", position: "Operator", hours: "" }];
    });
  }

  async function submit(fd: FormData) {
    setError("");
    setSaving(true);
    try {
      if (editing) {
        const res = await updateLog(projectId, initial!.id, fd);
        if (res.error) return setError(res.error);
      } else {
        const res = await addLog(projectId, fd);
        if (res.error) return setError(res.error);
      }
      onDone();
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const patchRow = (key: number, patch: Partial<CrewRow>) => setCrewRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={submit} style={{ marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
      {editing && (
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 12 }}>
          Fixing a mistake on this log. It will be marked as edited. Weekly T&amp;M invoices that were already generated won&apos;t change.
        </p>
      )}
      <Field label="Date">
        <input type="date" name="date" required style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Leak Number">
        <PickOrAdd name="leakNumber" options={leakNumbers} noneLabel="N/A" noneValue="N/A" newPlaceholder="New leak number" initial={initial?.leakNumber} />
      </Field>
      <datalist id={listId}>
        {people.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <Field label="Foreman">
        <input
          type="text"
          name="foreman"
          list={listId}
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
            initial={initial?.taskNumber || undefined}
          />
        </Field>
        <Field label="Locusview Number">
          <input type="text" name="locusviewNumber" style={inputStyle} defaultValue={initial?.locusviewNumber || ""} />
        </Field>
      </div>
      <Field label="Address">
        <input type="text" name="address" placeholder="Job site address" style={inputStyle} defaultValue={initial?.address || ""} />
      </Field>
      {/* Jobs with production quantities record line items below; the single pick stays only on logs that already used it. */}
      {(!production || initial?.lineItem) && (
        <Field label="Line Item">
          <select name="lineItem" style={inputStyle} defaultValue={initial?.lineItem || ""}>
            <option value="">— No line item —</option>
            {initial?.lineItem && !lineItems.some((li) => li.itemNo === initial.lineItem) && <option value={initial.lineItem}>{initial.lineItem}</option>}
            {sortedItems.map((li) => (
              <option key={li.itemNo} value={li.itemNo}>
                {li.itemNo} — {li.description}
              </option>
            ))}
          </select>
        </Field>
      )}

      {production && (
        <div style={{ marginBottom: 14, border: "1px solid var(--border)", borderRadius: 8, padding: "12px 12px 4px", background: "var(--surface-2)" }}>
          <label style={labelStyle}>Work installed today</label>
          <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0 0 10px" }}>
            Add each line item you worked on and how many you installed. You can add as many line items as you did today; leave it empty if nothing was installed.
          </p>
          {qtyRows.map((row) => {
            const li = lineItems.find((x) => x.itemNo === row.itemNo);
            const taken = new Set(qtyRows.filter((r) => r.key !== row.key).map((r) => r.itemNo));
            return (
              <div key={row.key} style={{ display: "grid", gridTemplateColumns: "1fr 110px auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <select
                  name="qtyItem"
                  value={row.itemNo}
                  onChange={(e) => setQtyRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, itemNo: e.target.value } : r)))}
                  style={inputStyle}
                  required
                >
                  <option value="">Pick a line item…</option>
                  {row.itemNo && !li && <option value={row.itemNo}>{row.itemNo}</option>}
                  {sortedItems.map((x) => (
                    <option key={x.itemNo} value={x.itemNo} disabled={taken.has(x.itemNo)}>
                      {itemLabel(x)}
                    </option>
                  ))}
                </select>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    name="qtyValue"
                    placeholder={li?.unit || "Qty"}
                    min="0"
                    step="any"
                    inputMode="decimal"
                    required
                    value={row.qty}
                    onChange={(e) => setQtyRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, qty: e.target.value } : r)))}
                    style={inputStyle}
                    aria-label={`Quantity installed${li?.unit ? ` (${li.unit})` : ""}`}
                  />
                </div>
                <button type="button" onClick={() => setQtyRows((rows) => rows.filter((r) => r.key !== row.key))} style={deleteBtnStyle} title="Remove this line item">
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setQtyRows((rows) => [...rows, { key: Math.max(-1, ...rows.map((r) => r.key)) + 1, itemNo: "", qty: "" }])}
            style={{ ...addBtnStyle, marginBottom: 10 }}
          >
            + Add line item
          </button>
          {billedThrough && date <= billedThrough && qtyRows.length > 0 && (
            <p style={{ fontSize: "0.76rem", color: "var(--danger)", margin: "0 0 10px" }}>
              A pay application already includes work through {billedThrough}. Quantities saved for this date won&apos;t change that pay application; tell the office.
            </p>
          )}
        </div>
      )}

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
            list={listId}
            autoComplete="off"
            placeholder="Pick or type a name"
            required
            value={row.name}
            onChange={(e) => patchRow(row.key, { name: e.target.value })}
            style={inputStyle}
          />
          <select name="crewPosition" value={row.position} onChange={(e) => patchRow(row.key, { position: e.target.value })} style={inputStyle}>
            {!POSITIONS.includes(row.position) && <option value={row.position}>{row.position}</option>}
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            type="number"
            name="crewHours"
            placeholder="Hours"
            min="0"
            step="any"
            inputMode="decimal"
            required
            value={row.hours}
            onChange={(e) => patchRow(row.key, { hours: e.target.value })}
            style={inputStyle}
          />
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
        onClick={() => setCrewRows((rows) => [...rows, { key: Math.max(0, ...rows.map((r) => r.key)) + 1, name: "", position: "Operator", hours: "" }])}
        style={{ ...addBtnStyle, marginBottom: 14 }}
      >
        + Add Crew Member
      </button>

      {(hasQuote || initial?.scopeChange) && (
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14, fontSize: "0.85rem", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", background: "var(--surface-2)" }}>
          <input type="checkbox" name="scopeChange" defaultChecked={!!initial?.scopeChange} style={{ marginTop: 3 }} />
          <span>
            <strong>This work is different from the quote.</strong> Check this if there was extra work, a change to what was quoted, or something quoted that wasn&apos;t done, and explain below. Leave it unchecked if it went as quoted.
          </span>
        </label>
      )}

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

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" onClick={onDone} style={secondaryBtnStyle}>
          Cancel
        </button>
        <button type="submit" disabled={saving} style={primaryBtnStyle}>
          {saving ? "Saving…" : editing ? "Save Changes" : "Add"}
        </button>
      </div>
    </form>
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
  isAdmin,
  production,
  billedThrough,
  hasQuote,
  readOnly = false,
}: {
  projectId: string;
  logs: LogEntry[];
  lineItems: LineItem[];
  leakNumbers: Choice[];
  taskNumbers: string[];
  people: string[];
  usualCrews: Record<string, string[]>;
  isAdmin: boolean;
  // Unit-price job with a line-item list: the form records quantities installed per line item.
  production: boolean;
  // Last day already included in a pay application built from the logs, if any.
  billedThrough: string | null;
  // The job has a quote attached, so each log says whether the work matched it.
  hasQuote: boolean;
  readOnly?: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [, startTransition] = useTransition();
  const sorted = logs.slice().sort((a, b) => b.date.localeCompare(a.date));
  const formProps = { projectId, lineItems, leakNumbers, taskNumbers, people, usualCrews, production, billedThrough, hasQuote };

  const pdfUrl = (qs: string) => `/projects/${projectId}/logs-pdf?${qs}`;
  const allSelected = sorted.length > 0 && selected.length === sorted.length;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <div style={cardStyle}>
      <div style={headStyle}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Daily Logs</h3>
        {!readOnly && (
          <button onClick={() => setShowForm((s) => !s)} style={addBtnStyle}>
            + Add Entry
          </button>
        )}
      </div>

      {showForm && !readOnly && <LogForm {...formProps} onDone={() => setShowForm(false)} />}

      {isAdmin && sorted.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", background: "var(--surface-2)", borderRadius: 8, padding: "10px 12px", marginBottom: 10, fontSize: "0.8rem" }}>
          <strong style={{ textTransform: "uppercase", fontSize: "0.72rem", color: "var(--muted)" }}>Export to PDF</strong>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : sorted.map((l) => l.id))} />
            Select all
          </label>
          <button disabled={!selected.length} onClick={() => window.open(pdfUrl(`ids=${selected.join(",")}`), "_blank")} style={{ ...addBtnStyle, opacity: selected.length ? 1 : 0.5 }}>
            Export selected ({selected.length})
          </button>
          <span style={{ color: "var(--muted)" }}>or a range:</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "5px 8px" }} />
          <span>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "5px 8px" }} />
          <button
            disabled={!from && !to}
            onClick={() => window.open(pdfUrl(`${from ? `from=${from}&` : ""}${to ? `to=${to}` : ""}`), "_blank")}
            style={{ ...addBtnStyle, opacity: from || to ? 1 : 0.5 }}
          >
            Export range
          </button>
        </div>
      )}

      {sorted.length ? (
        sorted.map((l) => {
          if (editingId === l.id && !readOnly) {
            return <LogForm key={l.id} {...formProps} initial={l} onDone={() => setEditingId(null)} />;
          }
          const li = l.lineItem ? lineItems.find((x) => x.itemNo === l.lineItem) : null;
          return (
            <div key={l.id} style={rowStyle}>
              {isAdmin && <input type="checkbox" checked={selected.includes(l.id)} onChange={() => toggle(l.id)} style={{ marginTop: 4 }} aria-label="Select for PDF export" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--muted)" }}>
                  {l.date}
                  {l.scopeChange && (
                    <span style={{ marginLeft: 8, background: "var(--danger)", color: "#fff", fontSize: "0.64rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase", fontFamily: "inherit" }}>
                      Different from quote
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--ink-soft)" }}>
                  Leak #: {l.leakNumber}
                  {l.foreman ? ` · Foreman: ${l.foreman}` : ""}
                  {l.taskNumber ? ` · Task #: ${l.taskNumber}` : ""}
                  {l.locusviewNumber ? ` · Locusview #: ${l.locusviewNumber}` : ""}
                  {l.lineItem ? ` · Item ${l.lineItem}${li?.description ? ` (${li.description})` : ""}` : ""}
                </div>
                {l.address && <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>{l.address}</div>}
                {!!l.quantities?.length && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", marginBottom: 3 }}>Installed</div>
                    {l.quantities.map((q) => {
                      const item = lineItems.find((x) => x.itemNo === q.itemNo);
                      return (
                        <div key={q.itemNo} style={{ fontSize: "0.82rem" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                            {fmtQty(q.qty)}
                            {item?.unit ? ` ${item.unit}` : ""}
                          </span>{" "}
                          <span style={{ color: "var(--ink-soft)" }}>
                            · Item {q.itemNo}
                            {item?.description ? ` — ${item.description}` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                {l.editedAt && (
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>
                    Edited{l.editedBy ? ` by ${l.editedBy}` : ""} on {new Date(l.editedAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                {isAdmin && (
                  <button onClick={() => window.open(pdfUrl(`ids=${l.id}`), "_blank")} style={{ ...deleteBtnStyle, width: "auto", padding: "0 8px", fontSize: "0.72rem", fontWeight: 600 }} title="Export this log to PDF">
                    PDF
                  </button>
                )}
                {!readOnly && (
                  <>
                    <button onClick={() => setEditingId(l.id)} style={deleteBtnStyle} title="Edit this log">
                      ✎
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete this log entry?")) startTransition(() => deleteLog(projectId, l.id));
                      }}
                      style={deleteBtnStyle}
                      title="Delete"
                    >
                      🗑
                    </button>
                  </>
                )}
              </div>
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
