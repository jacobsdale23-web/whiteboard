"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteOqQual, saveOqQualBatch } from "./actions";
import { OQ_DEFAULT_YEARS, addYears, oqState, today, type OqState } from "@/lib/hr";
import { btn, chip, dangerBtn, grid2, input, label, primaryBtn, td, th, type Tone } from "./hr-styles";

export type QualRow = { id: string; taskCode: string; taskName: string; qualifiedDate: string; expiresDate: string | null };
export type OqTask = { code: string; name: string };

const STATE_LABEL: Record<OqState, string> = { current: "Current", expiring: "Expiring soon", expired: "Expired", no_expiry: "No expiry set" };
const STATE_TONE: Record<OqState, Tone> = { current: "good", expiring: "warn", expired: "bad", no_expiry: "muted" };

// An employee's OQ qualifications. Adding picks one or more tasks that were
// qualified on the same date; expiry defaults to three years and can be changed.
export default function OqQuals({ employeeId, quals, tasks }: { employeeId: string; quals: QualRow[]; tasks: OqTask[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [qualified, setQualified] = useState(today());
  const [expires, setExpires] = useState(addYears(today(), OQ_DEFAULT_YEARS));
  const [expiresEdited, setExpiresEdited] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? tasks.filter((t) => `${t.code} ${t.name}`.toLowerCase().includes(q)) : tasks;
  }, [tasks, search]);
  const sorted = quals.slice().sort((a, b) => a.taskCode.localeCompare(b.taskCode, undefined, { numeric: true }));

  function startEdit(q: QualRow) {
    setOpen(true);
    setPicked([q.taskCode]);
    setQualified(q.qualifiedDate);
    setExpires(q.expiresDate ?? "");
    setExpiresEdited(true);
  }

  function reset() {
    setOpen(false);
    setPicked([]);
    setSearch("");
    setError("");
    setQualified(today());
    setExpires(addYears(today(), OQ_DEFAULT_YEARS));
    setExpiresEdited(false);
  }

  function onQualified(v: string) {
    setQualified(v);
    if (!expiresEdited && v) setExpires(addYears(v, OQ_DEFAULT_YEARS));
  }

  async function save() {
    setError("");
    setBusy(true);
    try {
      const res = await saveOqQualBatch(employeeId, { taskCodes: picked, qualifiedDate: qualified, expiresDate: expires });
      if (res.error) return setError(res.error);
      reset();
      router.refresh();
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this qualification?")) return;
    const res = await deleteOqQual(id);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>OQ qualifications</h3>
        {!open && (
          <button onClick={() => setOpen(true)} style={btn}>
            + Add qualification
          </button>
        )}
      </div>

      {open && (
        <div style={{ background: "var(--surface-2)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={grid2}>
            <div>
              <label style={label}>Qualified on</label>
              <input type="date" value={qualified} onChange={(e) => onQualified(e.target.value)} style={input} />
            </div>
            <div>
              <label style={label}>Expires (default {OQ_DEFAULT_YEARS} years)</label>
              <input
                type="date"
                value={expires}
                onChange={(e) => {
                  setExpires(e.target.value);
                  setExpiresEdited(true);
                }}
                style={input}
              />
            </div>
          </div>
          <label style={{ ...label, marginTop: 12 }}>Tasks ({picked.length} selected)</label>
          <input type="search" placeholder="Search task code or name" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...input, marginBottom: 8 }} />
          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--bg)" }}>
            {shown.map((t) => (
              <label key={t.code} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.84rem", padding: "4px 2px" }}>
                <input
                  type="checkbox"
                  checked={picked.includes(t.code)}
                  onChange={() => setPicked((p) => (p.includes(t.code) ? p.filter((c) => c !== t.code) : [...p, t.code]))}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong>{t.code}</strong> {t.name}
                </span>
              </label>
            ))}
            {!shown.length && <p style={{ color: "var(--muted)", fontSize: "0.82rem" }}>No tasks match.</p>}
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: "8px 0" }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={save} disabled={busy || !picked.length} style={{ ...primaryBtn, opacity: picked.length ? 1 : 0.5 }}>
              {busy ? "Saving…" : "Save qualification" + (picked.length === 1 ? "" : "s")}
            </button>
            <button onClick={reset} style={btn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!open && error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 8 }}>{error}</p>}

      {sorted.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Task</th>
                <th style={th}>Qualified</th>
                <th style={th}>Expires</th>
                <th style={th}>Status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((q) => {
                const state = oqState(q.expiresDate);
                return (
                  <tr key={q.id}>
                    <td style={td}>
                      <strong>{q.taskCode}</strong> {q.taskName}
                    </td>
                    <td style={td}>{q.qualifiedDate}</td>
                    <td style={td}>{q.expiresDate || "—"}</td>
                    <td style={td}>
                      <span style={chip(STATE_TONE[state])}>{STATE_LABEL[state]}</span>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button onClick={() => startEdit(q)} style={btn}>
                        Renew / edit
                      </button>{" "}
                      <button onClick={() => remove(q.id)} style={dangerBtn}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No OQ qualifications recorded yet.</p>
      )}
    </div>
  );
}
