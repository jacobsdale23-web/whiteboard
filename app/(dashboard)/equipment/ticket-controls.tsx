"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEquipmentTicket } from "./actions";

export default function TicketControls({ id, status, mechanicNotes }: { id: string; status: string; mechanicNotes: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newStatus, setNewStatus] = useState(status);
  const [notes, setNotes] = useState(mechanicNotes || "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function save(nextStatus: string) {
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await updateEquipmentTicket(id, nextStatus, notes);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save.");
      }
    });
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
      <label style={labelStyle}>Mechanic notes</label>
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        rows={2}
        placeholder="What you found, parts needed, what was done…"
        style={{ ...inputStyle, resize: "vertical" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <button onClick={() => save(newStatus)} disabled={pending} style={primaryBtnStyle}>
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && <span style={{ color: "var(--active)", fontSize: "0.8rem", fontWeight: 600 }}>Saved</span>}
        {error && <span style={{ color: "var(--danger)", fontSize: "0.8rem" }}>{error}</span>}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit", width: "100%" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.7rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
