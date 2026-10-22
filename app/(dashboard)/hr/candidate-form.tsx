"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCandidate } from "./actions";
import { CANDIDATE_STAGES } from "@/lib/hr";
import { btn, grid2, input, label, primaryBtn } from "./hr-styles";

export type CandidateRow = {
  id: string;
  companyId: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  position: string | null;
  source: string | null;
  stage: string;
  appliedDate: string | null;
  notes: string | null;
};

type Company = { id: string; name: string };

// Adds a candidate (collapsed behind a button) or edits one (always open).
export default function CandidateForm({ candidate, companies, defaultCompanyId }: { candidate?: CandidateRow; companies: Company[]; defaultCompanyId: string }) {
  const router = useRouter();
  const editing = !!candidate;
  const [open, setOpen] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(fd: FormData) {
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      const res = await saveCandidate(candidate?.id ?? null, {
        companyId: String(fd.get("companyId") || ""),
        name: String(fd.get("name") || ""),
        phone: String(fd.get("phone") || ""),
        email: String(fd.get("email") || ""),
        address: String(fd.get("address") || ""),
        position: String(fd.get("position") || ""),
        source: String(fd.get("source") || ""),
        stage: String(fd.get("stage") || candidate?.stage || "applied"),
        appliedDate: String(fd.get("appliedDate") || ""),
        notes: String(fd.get("notes") || ""),
      });
      if (res.error) return setError(res.error);
      if (editing) setSaved(true);
      else {
        setOpen(false);
        if (res.id) return router.push(`/hr/candidates/${res.id}`);
      }
      router.refresh();
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={primaryBtn}>
        + Add Candidate
      </button>
    );
  }

  return (
    <form action={submit} style={editing ? undefined : { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={grid2}>
        <Field text="Name *">
          <input name="name" required defaultValue={candidate?.name} style={input} />
        </Field>
        <Field text="Company *">
          <select name="companyId" defaultValue={candidate?.companyId ?? defaultCompanyId} style={input}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field text="Position applied for">
          <input name="position" defaultValue={candidate?.position ?? ""} placeholder="e.g. Welder, Laborer" style={input} />
        </Field>
        <Field text="Phone">
          <input name="phone" type="tel" defaultValue={candidate?.phone ?? ""} style={input} />
        </Field>
        <Field text="Email">
          <input name="email" type="email" defaultValue={candidate?.email ?? ""} style={input} />
        </Field>
        <Field text="Address">
          <input name="address" defaultValue={candidate?.address ?? ""} style={input} />
        </Field>
        <Field text="Source">
          <input name="source" defaultValue={candidate?.source ?? ""} placeholder="Referral, Indeed, walk-in…" style={input} />
        </Field>
        <Field text="Applied">
          <input name="appliedDate" type="date" defaultValue={candidate?.appliedDate ?? new Date().toISOString().slice(0, 10)} style={input} />
        </Field>
        {!editing && (
          <Field text="Stage">
            <select name="stage" defaultValue="applied" style={input}>
              {CANDIDATE_STAGES.filter((s) => s.value !== "hired").map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field text="Notes">
        <textarea name="notes" rows={3} defaultValue={candidate?.notes ?? ""} style={{ ...input, resize: "vertical" }} />
      </Field>
      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 8 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="submit" disabled={busy} style={primaryBtn}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add candidate"}
        </button>
        {!editing && (
          <button type="button" onClick={() => setOpen(false)} style={btn}>
            Cancel
          </button>
        )}
        {saved && <span style={{ color: "var(--active)", fontSize: "0.85rem" }}>Saved.</span>}
      </div>
    </form>
  );
}

function Field({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={label}>{text}</label>
      {children}
    </div>
  );
}
