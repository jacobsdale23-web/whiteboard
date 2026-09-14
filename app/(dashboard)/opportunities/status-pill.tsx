"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateBidStatus, type StatusFormState } from "./actions";

const STATUSES = ["Open", "Won", "Lost", "Abandoned"];

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Open: { bg: "var(--upcoming-bg)", fg: "var(--upcoming)" },
  Won: { bg: "var(--active-bg)", fg: "var(--active)" },
  Lost: { bg: "var(--danger-bg)", fg: "var(--danger)" },
  Abandoned: { bg: "var(--surface-2)", fg: "var(--ink-soft)" },
};

async function submit(_prev: StatusFormState, formData: FormData) {
  return updateBidStatus(_prev, formData);
}

export default function StatusPill({
  id,
  jobName,
  bidValue,
  bidStatus,
  alreadyConverted,
}: {
  id: string;
  jobName: string;
  bidValue: string | null;
  bidStatus: string;
  alreadyConverted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<StatusFormState, FormData>(submit, null);
  const colors = STATUS_COLORS[bidStatus] || STATUS_COLORS.Open;
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: colors.bg,
          color: colors.fg,
          border: "none",
          borderRadius: 20,
          padding: "3px 10px",
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          cursor: "pointer",
        }}
        title="Click to update bid status"
      >
        {bidStatus}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(20,18,15,0.55)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "5vh 16px",
            overflowY: "auto",
            zIndex: 50,
          }}
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <form
            action={formAction}
            style={{
              background: "var(--surface)",
              borderRadius: 12,
              width: "100%",
              maxWidth: 380,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              border: "1px solid var(--border)",
            }}
          >
            <h2 style={{ marginBottom: 4, textTransform: "uppercase" }}>Update Bid Status</h2>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 16 }}>{jobName}</p>
            <input type="hidden" name="id" value={id} />

            <label style={fieldLabelStyle}>
              Bid Value ($)
              <input type="number" name="bidValue" min="0" step="1" defaultValue={bidValue || ""} style={inputStyle} />
            </label>

            <label style={fieldLabelStyle}>
              Status
              <select name="bidStatus" defaultValue={bidStatus} style={inputStyle}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            {alreadyConverted && (
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", background: "var(--surface-2)", borderRadius: 6, padding: "9px 11px" }}>
                This one already moved to Upcoming Projects.
              </p>
            )}
            {state?.error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{state.error}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{ background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                style={{ background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" }}
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontSize: "0.74rem",
  fontWeight: 600,
  color: "var(--muted)",
  textTransform: "uppercase",
  marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "9px 10px",
  fontSize: "0.92rem",
  color: "var(--ink)",
  fontFamily: "inherit",
  textTransform: "none",
  fontWeight: 400,
};
