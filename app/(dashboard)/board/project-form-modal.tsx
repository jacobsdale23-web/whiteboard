"use client";

import { useState } from "react";
import { saveProject, deleteProject, type ProjectInput } from "./actions";
import { JOB_KINDS, JOB_KIND_HINTS, JOB_KIND_LABELS, cleanJobKind } from "@/lib/job-kinds";

export type ParentOption = { id: string; label: string };

type ProjectRow = {
  id: string;
  name: string;
  location: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  value: string | null;
  crew: string[] | null;
  billingType: string;
  projectNumber: string | null;
  customer: string | null;
  jobKind?: string;
  billedThroughProjectId?: string | null;
  notes?: string | null;
};
type CrewMember = { id: string; name: string };

const STATUSES = [
  { value: "upcoming", label: "upcoming" },
  { value: "active", label: "active" },
  { value: "on_hold", label: "on hold (paused, we'll return to it)" },
  { value: "complete", label: "complete (stays on calendar until billed; an FWI hot tap closes out on its own)" },
  { value: "billed", label: "billed (moves to Completed, off calendar)" },
  { value: "canceled", label: "canceled (moves to Completed, off calendar)" },
];
const BILLING_TYPES = [
  { value: "lump_sum", label: "Lump Sum / Unit Price" },
  { value: "tm", label: "T&M" },
];

export default function ProjectFormModal({ project, crewList, parentOptions = [], showNotes = false }: { project?: ProjectRow; crewList: CrewMember[]; parentOptions?: ParentOption[]; showNotes?: boolean }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [billingType, setBillingType] = useState(project?.billingType || "lump_sum");
  const [jobKind, setJobKind] = useState(cleanJobKind(project?.jobKind));
  const isEdit = !!project;
  const isFwiTap = jobKind === "fwi_hot_tap";
  const parents = parentOptions.filter((p) => p.id !== project?.id);

  async function handleSubmit(formData: FormData) {
    setError("");
    setSaving(true);
    const crew = formData.getAll("crew").map(String);
    const data: ProjectInput = {
      name: String(formData.get("name") || "").trim(),
      location: String(formData.get("location") || "").trim() || null,
      status: String(formData.get("status") || "upcoming"),
      startDate: String(formData.get("startDate") || "") || null,
      endDate: String(formData.get("endDate") || "") || null,
      duration: String(formData.get("duration") || "").trim() || null,
      value: formData.get("value") === "" ? null : Number(formData.get("value")),
      crew,
      billingType: isFwiTap ? "lump_sum" : String(formData.get("billingType") || "lump_sum"),
      projectNumber: String(formData.get("projectNumber") || "").trim() || null,
      customer: String(formData.get("customer") || "").trim() || null,
      jobKind,
      billedThroughProjectId: isFwiTap ? String(formData.get("billedThroughProjectId") || "") || null : null,
      // Only sent when the box is on the form, so a form without it never clears the notes.
      ...(showNotes ? { notes: String(formData.get("notes") || "") } : {}),
    };
    try {
      await saveProject(project?.id ?? null, data);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that project.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!project) return;
    if (!confirm(`Delete "${project.name}"? This can't be undone.`)) return;
    await deleteProject(project.id);
    setOpen(false);
  }

  return (
    <>
      {isEdit ? (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }}
          style={iconBtnStyle}
          title="Edit"
        >
          ✎
        </button>
      ) : (
        <button onClick={() => setOpen(true)} style={primaryBtnStyle}>
          + New Project
        </button>
      )}

      {open && (
        <div
          style={overlayStyle}
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <form action={handleSubmit} style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: 16, textTransform: "uppercase" }}>{isEdit ? "Edit Project" : "New Project"}</h2>

            <Field label="Job Type">
              <select value={jobKind} onChange={(e) => setJobKind(cleanJobKind(e.target.value))} style={inputStyle}>
                {JOB_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {JOB_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              {JOB_KIND_HINTS[jobKind] && <div style={{ color: "var(--muted)", fontSize: "0.74rem", marginTop: 4, textTransform: "none", fontWeight: 400 }}>{JOB_KIND_HINTS[jobKind]}</div>}
            </Field>
            {isFwiTap && (
              <Field label="Billed Through (the job this tap is for)">
                <select name="billedThroughProjectId" defaultValue={project?.billedThroughProjectId || ""} style={inputStyle}>
                  <option value="">Not picked yet</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <div style={{ color: "var(--muted)", fontSize: "0.74rem", marginTop: 4, textTransform: "none", fontWeight: 400 }}>
                  It will not be billed on its own. It shows on that job so the tap goes on that job&apos;s invoice.
                </div>
              </Field>
            )}
            <Field label="Project Name">
              <input type="text" name="name" required defaultValue={project?.name} style={inputStyle} />
            </Field>
            <Field label="Customer">
              <input type="text" name="customer" defaultValue={project?.customer || ""} style={inputStyle} />
            </Field>
            <Field label="Location">
              <input type="text" name="location" defaultValue={project?.location || ""} style={inputStyle} />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={project?.status || "upcoming"} style={inputStyle}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            {!isFwiTap && (
              <Field label="Billing Type">
                <select name="billingType" value={billingType} onChange={(e) => setBillingType(e.target.value)} style={inputStyle}>
                  {BILLING_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="QuickBooks Project #">
              <input
                type="text"
                name="projectNumber"
                maxLength={12}
                pattern="(\d{5}|\d{2}[A-Za-z]{3,10})"
                title="The project number from QuickBooks, like 26108"
                placeholder="From QuickBooks, like 26108"
                defaultValue={project?.projectNumber || ""}
                style={inputStyle}
              />
              <div style={{ color: "var(--muted)", fontSize: "0.74rem", marginTop: 4 }}>
                {isFwiTap
                  ? "An FWI hot tap has no QuickBooks job of its own, so this can stay blank."
                  : "Create the project in QuickBooks first, then enter its number here exactly. The field clocks in by this number."}
              </div>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Start Date">
                <input type="date" name="startDate" defaultValue={project?.startDate || ""} style={inputStyle} />
              </Field>
              <Field label="Completion Date">
                <input type="date" name="endDate" defaultValue={project?.endDate || ""} style={inputStyle} />
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Duration (if no dates)">
                <input type="text" name="duration" placeholder="e.g. 60 Days" defaultValue={project?.duration || ""} style={inputStyle} />
              </Field>
              <Field label="Project Value ($)">
                <input type="number" name="value" min="0" step="1" defaultValue={project?.value || ""} style={inputStyle} />
              </Field>
            </div>
            {showNotes && (
              <Field label="Notes for the Crew">
                <textarea
                  name="notes"
                  rows={5}
                  maxLength={4000}
                  defaultValue={project?.notes || ""}
                  placeholder={"Phone numbers, who to call, gate codes, info about the job.\nThe foremen see this when they open the project."}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              </Field>
            )}
            <Field label="Crew">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px,1fr))", gap: 6, maxHeight: 130, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 10, background: "var(--bg)" }}>
                {crewList.length ? (
                  crewList.map((c) => (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 400, textTransform: "none" }}>
                      <input type="checkbox" name="crew" value={c.name} defaultChecked={project?.crew?.includes(c.name)} />
                      {c.name}
                    </label>
                  ))
                ) : (
                  <span style={{ color: "var(--muted)", fontSize: "0.82rem", fontStyle: "italic" }}>No crew on file yet.</span>
                )}
              </div>
            </Field>

            {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              {isEdit && (
                <button type="button" onClick={handleDelete} style={dangerBtnStyle}>
                  Delete
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button type="button" onClick={() => setOpen(false)} style={secondaryBtnStyle}>
                Cancel
              </button>
              <button type="submit" disabled={saving} style={primaryBtnStyle}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Project"}
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

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(20,18,15,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto", zIndex: 50 };
const modalStyle: React.CSSProperties = { background: "var(--surface)", borderRadius: 12, width: "100%", maxWidth: 460, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", border: "1px solid var(--border)" };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 10px", fontSize: "0.92rem", color: "var(--ink)", fontFamily: "inherit", textTransform: "none", fontWeight: 400 };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const dangerBtnStyle: React.CSSProperties = { background: "var(--danger-bg)", color: "var(--danger)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const iconBtnStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
