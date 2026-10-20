"use client";

import { useState } from "react";
import { addEquipmentTicket } from "./equipment-actions";

export default function EquipmentSection({ projectId }: { projectId: string }) {
  const [showForm, setShowForm] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(fd: FormData) {
    setError("");
    setPending(true);
    try {
      const res = await addEquipmentTicket(projectId, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setShowForm(false);
      setSent(true);
    } catch {
      setError("Couldn't send that ticket. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={cardStyle}>
      <div style={headStyle}>
        <div>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Equipment Issue</h3>
          <p style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>
            Optional — report broken equipment so the mechanics can get on it
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((s) => !s);
            setSent(false);
          }}
          style={addBtnStyle}
        >
          + Report Equipment Issue
        </button>
      </div>

      {sent && (
        <p style={{ color: "var(--active)", fontSize: "0.85rem", fontWeight: 600 }}>
          Sent to the mechanics. You can report another one anytime.
        </p>
      )}

      {showForm && (
        <form action={submit}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Your Name">
              <input type="text" name="reportedBy" required style={inputStyle} />
            </Field>
            <Field label="Date">
              <input type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} style={inputStyle} />
            </Field>
          </div>
          <Field label="Equipment (name / unit number)">
            <input type="text" name="equipment" required placeholder="e.g. CAT 308 excavator, Unit 12" style={inputStyle} />
          </Field>
          <Field label="How bad is it?">
            <select name="urgency" defaultValue="down" style={inputStyle}>
              <option value="down">Down — can't run it</option>
              <option value="repair_soon">Running, but needs repair soon</option>
              <option value="minor">Minor issue</option>
            </select>
          </Field>
          <Field label="What's wrong?">
            <textarea
              name="problem"
              rows={3}
              required
              onInput={(e) => e.currentTarget.setCustomValidity(e.currentTarget.value.trim() ? "" : "Please fill out this field.")}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>
          <Field label="What do you think could be causing it? (optional)">
            <textarea name="suspectedCause" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </Field>
          {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 10 }}>{error}</p>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={() => setShowForm(false)} style={secondaryBtnStyle}>
              Cancel
            </button>
            <button type="submit" disabled={pending} style={primaryBtnStyle}>
              {pending ? "Sending…" : "Send to Mechanics"}
            </button>
          </div>
        </form>
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
const headStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit", width: "100%" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
