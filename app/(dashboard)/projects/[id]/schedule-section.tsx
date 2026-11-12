"use client";

import { useState, useTransition } from "react";
import ScheduleForm from "../../calendar/schedule-form";
import { deleteScheduleRow } from "../../calendar/schedule-actions";

export type SectionRow = { id: string; person: string; startDate: string; endDate: string; range: string; location: string | null; taskNumber: string | null; note: string | null; clash: string | null; past: boolean };

// Who is going to this job, and when. One standing job (like a customer's T&M tab) can have a different welder at a
// different location on different days; each line is one person for a run of days.
export default function ScheduleSection({ projectId, rows, names, taskNumbers, defaultLocation, readOnly }: { projectId: string; rows: SectionRow[]; names: string[]; taskNumbers: string[]; defaultLocation: string; readOnly: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const upcoming = rows.filter((r) => !r.past);
  const past = rows.filter((r) => r.past);

  function remove(id: string) {
    setError("");
    startTransition(async () => {
      const res = await deleteScheduleRow(id);
      if (res.error) setError(res.error);
      setConfirming(null);
    });
  }

  const line = (r: SectionRow) =>
    editing === r.id ? (
      <div key={r.id} style={{ padding: "8px 0" }}>
        <ScheduleForm
          projectId={projectId}
          names={names}
          taskNumbers={taskNumbers}
          row={{ id: r.id, person: r.person, startDate: r.startDate, endDate: r.endDate, location: r.location, taskNumber: r.taskNumber, note: r.note }}
          onDone={() => setEditing(null)}
        />
      </div>
    ) : (
      <div key={r.id} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: "0.9rem" }}>
        <div style={{ minWidth: 0 }}>
          <strong>{r.person}</strong> <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}>· {r.range}</span>
          {r.location && <span style={{ color: "var(--ink-soft)" }}> · {r.location}</span>}
          {r.taskNumber && <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}> · PO {r.taskNumber}</span>}
          {r.note && <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{r.note}</div>}
          {r.clash && <div style={{ color: "var(--danger)", fontSize: "0.8rem", fontWeight: 600 }}>⚠ {r.clash}</div>}
        </div>
        {!readOnly && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            {confirming === r.id ? (
              <>
                <span style={{ fontSize: "0.8rem" }}>Remove this line?</span>
                <button disabled={pending} onClick={() => remove(r.id)} style={{ ...smallBtn, background: "var(--danger)", color: "#fff", border: "none" }}>
                  Yes, remove
                </button>
                <button onClick={() => setConfirming(null)} style={smallBtn}>
                  Keep
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(r.id)} style={smallBtn} title="Edit">
                  ✎
                </button>
                <button onClick={() => setConfirming(r.id)} style={smallBtn} title="Remove">
                  ✕
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Schedule ({upcoming.length})</h3>
        {!readOnly && !adding && (
          <button onClick={() => setAdding(true)} style={{ ...smallBtn, background: "var(--rust)", color: "var(--rust-ink)", border: "none", padding: "7px 13px" }}>
            + Schedule someone
          </button>
        )}
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: 10 }}>Who is going to this job, which days, and where. Hover the job on the Calendar to see it.</p>
      {adding && (
        <div style={{ marginBottom: 10 }}>
          <ScheduleForm projectId={projectId} names={names} taskNumbers={taskNumbers} defaultLocation={defaultLocation} onDone={() => setAdding(false)} />
        </div>
      )}
      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}
      {!rows.length && !adding && <p style={{ color: "var(--muted)", fontSize: "0.88rem" }}>Nobody scheduled yet.</p>}
      {upcoming.map(line)}
      {!!past.length && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)", fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase" }}>Earlier ({past.length})</summary>
          {past.map(line)}
        </details>
      )}
    </div>
  );
}

const smallBtn: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem" };
