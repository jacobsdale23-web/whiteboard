"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveOpportunity, type OpportunityFormState } from "./actions";

const KINDS = ["Opportunity", "Meeting"];
const OPP_TYPES = ["Bid Job", "Meeting", "Hot Tap", "O&M", "T&M (Atmos)"];
const ESTIMATORS = ["Jacob", "Chris", "Daryl", "Cavin", "Ross", "Paul"];

type OpportunityRow = {
  id: string;
  kind: string;
  oppType: string;
  jobName: string;
  estimator: string | null;
  bidDueDate: string | null;
  customer: string | null;
  location: string | null;
};

async function submit(_prev: OpportunityFormState, formData: FormData) {
  return saveOpportunity(_prev, formData);
}

export default function OpportunityFormModal({ opportunity }: { opportunity?: OpportunityRow }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<OpportunityFormState, FormData>(submit, null);
  const isEdit = !!opportunity;
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <>
      {isEdit ? (
        <button onClick={() => setOpen(true)} style={iconBtnStyle} title="Edit">
          ✎
        </button>
      ) : (
        <button onClick={() => setOpen(true)} style={primaryBtnStyle}>
          + New Opportunity
        </button>
      )}

      {open && (
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form action={formAction} style={modalStyle}>
            <h2 style={{ marginBottom: 16, textTransform: "uppercase" }}>
              {isEdit ? "Edit Opportunity" : "New Opportunity"}
            </h2>
            {isEdit && <input type="hidden" name="id" value={opportunity.id} />}

            <Field label="Opportunity or Meeting">
              <select name="kind" defaultValue={opportunity?.kind || "Opportunity"} style={inputStyle}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Opportunity Type">
              <select name="oppType" defaultValue={opportunity?.oppType || "Bid Job"} style={inputStyle}>
                {OPP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Job Name">
              <input type="text" name="jobName" required defaultValue={opportunity?.jobName} style={inputStyle} />
            </Field>

            <Field label="Estimator">
              <select name="estimator" defaultValue={opportunity?.estimator || "Jacob"} style={inputStyle}>
                {ESTIMATORS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Bid Due Date">
              <input type="date" name="bidDueDate" defaultValue={opportunity?.bidDueDate || ""} style={inputStyle} />
            </Field>

            <Field label="Customer">
              <input type="text" name="customer" defaultValue={opportunity?.customer || ""} style={inputStyle} />
            </Field>

            <Field label="Location">
              <input
                type="text"
                name="location"
                placeholder="City, State"
                defaultValue={opportunity?.location || ""}
                style={inputStyle}
              />
            </Field>

            {state?.error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{state.error}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setOpen(false)} style={secondaryBtnStyle}>
                Cancel
              </button>
              <button type="submit" disabled={pending} style={primaryBtnStyle}>
                {pending ? "Saving…" : isEdit ? "Save Changes" : "Create Opportunity"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.74rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 14 }}>
      {label}
      {children}
    </label>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(20,18,15,0.55)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "5vh 16px",
  overflowY: "auto",
  zIndex: 50,
};

const modalStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: 12,
  width: "100%",
  maxWidth: 460,
  padding: 24,
  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
  border: "1px solid var(--border)",
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

const primaryBtnStyle: React.CSSProperties = {
  background: "var(--rust)",
  color: "var(--rust-ink)",
  border: "none",
  borderRadius: 6,
  padding: "9px 16px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.88rem",
};

const secondaryBtnStyle: React.CSSProperties = {
  background: "var(--surface-2)",
  color: "var(--ink)",
  border: "none",
  borderRadius: 6,
  padding: "9px 16px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "0.88rem",
};

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--border)",
  borderRadius: 5,
  width: 28,
  height: 28,
  cursor: "pointer",
  color: "var(--muted)",
};
