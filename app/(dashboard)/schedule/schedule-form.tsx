"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveScheduleRow, type ScheduleFormState } from "./actions";

export type EditRow = { id: string; person: string; startDate: string; endDate: string; location: string | null; taskNumber: string | null; note: string | null };

async function submit(_prev: ScheduleFormState, formData: FormData) {
  return saveScheduleRow(_prev, formData);
}

// Used on a job's page (the job is fixed) and on the Schedule page (pick the job). Adding takes several people at once
// ("Scott, Jan"); editing changes one line.
export default function ScheduleForm({
  projectId,
  projects,
  names,
  taskNumbers = [],
  defaultLocation = "",
  defaultStart = "",
  row,
  onDone,
}: {
  projectId?: string;
  projects?: { id: string; name: string }[];
  names: string[];
  taskNumbers?: string[];
  defaultLocation?: string;
  defaultStart?: string;
  row?: EditRow;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState<ScheduleFormState, FormData>(submit, null);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const listId = useRef(`people-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    if (wasPending.current && !pending && state && !state.error) {
      if (!row) formRef.current?.reset();
      onDone?.();
    }
    wasPending.current = pending;
  }, [pending, state, row, onDone]);

  return (
    <form ref={formRef} action={formAction} style={{ display: "grid", gap: 10, background: "var(--surface-2)", borderRadius: 10, padding: 14 }}>
      {row && <input type="hidden" name="id" value={row.id} />}
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      {!projectId && (
        <Field label="Job">
          <select name="projectId" required defaultValue="" style={inputStyle}>
            <option value="" disabled>
              Choose the job…
            </option>
            {(projects || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={row ? "Who" : "Who is going (separate several with commas)"}>
        <input name="person" required list={listId} defaultValue={row?.person || ""} placeholder="e.g. Benjamin Nelson, Jan Perez" style={inputStyle} />
        <datalist id={listId}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="First day">
          <input type="date" name="startDate" required defaultValue={row?.startDate || defaultStart} style={inputStyle} />
        </Field>
        <Field label="Last day (blank = one day)">
          <input type="date" name="endDate" defaultValue={row && row.endDate !== row.startDate ? row.endDate : ""} style={inputStyle} />
        </Field>
      </div>
      <Field label="Location">
        <input name="location" defaultValue={row?.location ?? defaultLocation} placeholder="Where they are going" style={inputStyle} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Task / PO number">
          <input name="taskNumber" defaultValue={row?.taskNumber || ""} list={`${listId}-tasks`} placeholder="optional" style={inputStyle} />
          <datalist id={`${listId}-tasks`}>
            {taskNumbers.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Note">
          <input name="note" defaultValue={row?.note || ""} placeholder="optional" style={inputStyle} />
        </Field>
      </div>
      {state?.error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{state.error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {row && onDone && (
          <button type="button" onClick={onDone} style={secondaryBtn}>
            Cancel
          </button>
        )}
        <button type="submit" disabled={pending} style={primaryBtn}>
          {pending ? "Saving…" : row ? "Save changes" : "Add to schedule"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.9rem", color: "var(--ink)", fontFamily: "inherit", textTransform: "none", fontWeight: 400, minWidth: 0 };
const primaryBtn: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const secondaryBtn: React.CSSProperties = { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
