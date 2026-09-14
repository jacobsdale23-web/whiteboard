"use client";

import { useState } from "react";
import { saveProject, deleteProject, type ProjectInput } from "./actions";

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
};
type CrewMember = { id: string; name: string };

const STATUSES = ["upcoming", "active", "complete"];

export default function ProjectFormModal({ project, crewList }: { project?: ProjectRow; crewList: CrewMember[] }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!project;

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

            <Field label="Project Name">
              <input type="text" name="name" required defaultValue={project?.name} style={inputStyle} />
            </Field>
            <Field label="Location">
              <input type="text" name="location" defaultValue={project?.location || ""} style={inputStyle} />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={project?.status || "upcoming"} style={inputStyle}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
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
