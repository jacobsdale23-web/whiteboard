"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveOpportunity, type OpportunityFormState } from "./actions";
import LocationInput from "../location-input";
import AttendeesInput from "./attendees-input";
import { isMeeting } from "@/lib/meeting";

const KINDS = ["Opportunity", "Meeting"];
const OPP_TYPES = ["Bid Job", "Quick Job", "T&M Job", "Meeting", "Hot Tap", "FWI Hot Tap", "O&M", "T&M (Atmos)"];

type OpportunityRow = {
  id: string;
  kind: string;
  oppType: string;
  jobName: string;
  estimator: string | null;
  bidDueDate: string | null;
  customer: string | null;
  location: string | null;
  meetingTime: string | null;
  attendees: string[];
};

async function submit(_prev: OpportunityFormState, formData: FormData) {
  return saveOpportunity(_prev, formData);
}

export default function OpportunityFormModal({ opportunity, estimators, people }: { opportunity?: OpportunityRow; estimators: string[]; people: string[] }) {
  // Meetings get a time and attendees; the fields follow whichever of the two dropdowns says "Meeting".
  const [kind, setKind] = useState(opportunity?.kind || "Opportunity");
  const [oppType, setOppType] = useState(opportunity?.oppType || "Bid Job");
  const meeting = isMeeting({ kind, oppType });
  // The PM list. An estimator who has since left the list stays selectable on the opportunities that already have them.
  const current = opportunity?.estimator || "";
  const options = current && !estimators.includes(current) ? [current, ...estimators] : estimators;
  const defaultEstimator = current || (estimators.includes("Jacob") ? "Jacob" : estimators[0] || "");
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<OpportunityFormState, FormData>(submit, null);
  const isEdit = !!opportunity;
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  // Each time the form opens, the two dropdowns start from what is saved.
  function openForm() {
    setKind(opportunity?.kind || "Opportunity");
    setOppType(opportunity?.oppType || "Bid Job");
    setOpen(true);
  }

  return (
    <>
      {isEdit ? (
        <button onClick={openForm} style={iconBtnStyle} title="Edit">
          ✎
        </button>
      ) : (
        <button onClick={openForm} style={primaryBtnStyle}>
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
              <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Opportunity Type">
              <select name="oppType" value={oppType} onChange={(e) => setOppType(e.target.value)} style={inputStyle}>
                {OPP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={meeting ? "Meeting Name" : "Job Name"}>
              <input type="text" name="jobName" required defaultValue={opportunity?.jobName} style={inputStyle} />
            </Field>

            <Field label={meeting ? "Organizer" : "Estimator"}>
              <select name="estimator" defaultValue={defaultEstimator} style={inputStyle}>
                {options.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={meeting ? "Meeting Date" : "Bid Due Date"}>
              <input type="date" name="bidDueDate" defaultValue={opportunity?.bidDueDate || ""} style={inputStyle} />
            </Field>

            {meeting && (
              <>
                <Field label="Time">
                  <input type="time" name="meetingTime" defaultValue={opportunity?.meetingTime || ""} style={inputStyle} />
                </Field>
                {/* Not wrapped in Field (a label): clicking a name chip must not jump to another control. */}
                <AttendeesInput initial={opportunity?.attendees || []} suggestions={people} inputStyle={inputStyle} />
              </>
            )}

            <Field label="Customer">
              <input type="text" name="customer" defaultValue={opportunity?.customer || ""} style={inputStyle} />
            </Field>

            <Field label="Location">
              <LocationInput
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
