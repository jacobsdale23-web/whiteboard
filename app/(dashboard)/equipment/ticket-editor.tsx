"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editEquipmentTicket, deleteEquipmentTicket } from "./actions";

type Props = {
  id: string;
  equipment: string;
  urgency: string;
  problem: string;
  suspectedCause: string | null;
  isAdmin: boolean;
};

export default function TicketEditor({ id, equipment, urgency, problem, suspectedCause, isAdmin }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ equipment, urgency, problem, suspectedCause: suspectedCause || "" });

  function save() {
    setError("");
    startTransition(async () => {
      try {
        const res = await editEquipmentTicket(id, form);
        if (res.error) return setError(res.error);
        setEditing(false);
        router.refresh();
      } catch {
        setError("Couldn't save. Please try again.");
      }
    });
  }

  function remove() {
    setError("");
    startTransition(async () => {
      try {
        const res = await deleteEquipmentTicket(id);
        if (res.error) return setError(res.error);
        router.refresh();
      } catch {
        setError("Couldn't delete. Please try again.");
      }
    });
  }

  return (
    <div style={{ marginTop: 8 }}>
      {!editing && !confirmDelete && (
        <div style={{ display: "flex", gap: 14 }}>
          <button onClick={() => setEditing(true)} style={linkBtnStyle}>
            Edit ticket
          </button>
          {isAdmin && (
            <button onClick={() => setConfirmDelete(true)} style={{ ...linkBtnStyle, color: "var(--danger)" }}>
              Delete
            </button>
          )}
        </div>
      )}

      {confirmDelete && (
        <div style={{ background: "var(--danger-bg)", borderRadius: 6, padding: "10px 12px", fontSize: "0.84rem" }}>
          <div style={{ marginBottom: 8, color: "var(--danger)", fontWeight: 600 }}>
            Delete this ticket and its update history? This can&apos;t be undone.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={remove} disabled={pending} style={{ ...btnStyle, background: "var(--danger)", color: "#fff", border: "none" }}>
              {pending ? "Deleting…" : "Yes, delete"}
            </button>
            <button onClick={() => setConfirmDelete(false)} disabled={pending} style={btnStyle}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg)" }}>
          <label style={labelStyle}>Equipment</label>
          <input value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} style={inputStyle} />
          <label style={labelStyle}>How bad is it?</label>
          <select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })} style={inputStyle}>
            <option value="down">Down — can&apos;t run it</option>
            <option value="repair_soon">Running, but needs repair soon</option>
            <option value="minor">Minor issue</option>
          </select>
          <label style={labelStyle}>What&apos;s wrong?</label>
          <textarea value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          <label style={labelStyle}>Possible cause</label>
          <textarea value={form.suspectedCause} onChange={(e) => setForm({ ...form, suspectedCause: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={save} disabled={pending} style={{ ...btnStyle, background: "var(--rust)", color: "var(--rust-ink)", border: "none" }}>
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setError("");
                setForm({ equipment, urgency, problem, suspectedCause: suspectedCause || "" });
              }}
              disabled={pending}
              style={btnStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const linkBtnStyle: React.CSSProperties = { background: "none", border: "none", padding: 0, color: "var(--ink-soft)", fontSize: "0.8rem", fontWeight: 600, textDecoration: "underline", cursor: "pointer" };
const btnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", borderRadius: 6, padding: "7px 14px", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" };
const inputStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit", width: "100%", marginBottom: 8 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.7rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 };
