"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setProjectDates, setProjectStatus } from "../board/actions";
import type { GanttProject } from "@/lib/gantt";
import { findConflicts, rangeLabel, type SchedRow } from "@/lib/schedule";
import ScheduleSection from "../projects/[id]/schedule-section";

const STATUS_CHOICES = [
  { value: "upcoming", label: "Upcoming", hint: "Not started yet" },
  { value: "active", label: "Active", hint: "Crew is working it" },
  { value: "on_hold", label: "On hold", hint: "Paused; we'll come back to it. Stays on the calendar and board in its own color" },
  { value: "complete", label: "Complete", hint: "Done; stays on the calendar until billed" },
  { value: "billed", label: "Billed", hint: "Invoiced; moves to Completed and leaves the calendar" },
  { value: "canceled", label: "Canceled", hint: "Won't happen; moves to Completed (Canceled tab) and leaves the calendar" },
];

// Opened by clicking a job on the timeline, week or day view.
export default function StatusDialog({ project, readOnly, crew, names, projectNames, todayIso, onClose }: { project: GanttProject; readOnly: boolean; crew: SchedRow[]; names: string[]; projectNames: Record<string, string>; todayIso: string; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  // Who is scheduled on this job, with a warning on anyone also booked on a different job the same days.
  const clashes = findConflicts(crew);
  const sectionRows = crew
    .filter((r) => r.projectId === project.id)
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.person.localeCompare(b.person))
    .map((r) => {
      const hits = (clashes.get(r.id) || []).filter((o) => o.projectId !== project.id);
      return { ...r, range: rangeLabel(r), past: r.endDate < todayIso, clash: hits.length ? `Also scheduled on ${hits.map((o) => `${projectNames[o.projectId] || "another job"} (${rangeLabel(o)})`).join("; ")}` : null };
    });
  const [error, setError] = useState("");
  const [start, setStart] = useState(project.startDate || "");
  const [end, setEnd] = useState(project.endDate || "");
  const [datesSaved, setDatesSaved] = useState(false);
  const datesChanged = start !== (project.startDate || "") || end !== (project.endDate || "");

  function saveDates() {
    setError("");
    setDatesSaved(false);
    startTransition(async () => {
      try {
        await setProjectDates(project.id, start || null, end || null);
        setDatesSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't change the dates.");
      }
    });
  }

  function changeStatus(status: string) {
    if (status === project.status) return;
    setError("");
    startTransition(async () => {
      try {
        await setProjectStatus(project.id, status);
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't change the status.");
      }
    });
  }

  return (
    <div
      onClick={() => !pending && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px", width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 16px 48px rgba(0,0,0,0.35)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{project.name}</div>
            {project.location && <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{project.location}</div>}
            <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>PM: {project.pm || "Not assigned"}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "transparent", color: "var(--muted)", fontSize: "1.4rem", lineHeight: 1, cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        {readOnly ? (
          <div style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "14px 0" }}>Status: {project.status.replace("_", " ")}</div>
        ) : (
          <>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", margin: "16px 0 8px" }}>Status</div>
            <div style={{ display: "grid", gap: 8 }}>
              {STATUS_CHOICES.map((s) => {
                const current = s.value === project.status;
                return (
                  <button
                    key={s.value}
                    disabled={pending}
                    onClick={() => changeStatus(s.value)}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${current ? "var(--rust)" : "var(--border)"}`,
                      background: current ? "var(--rust)" : "var(--surface-2)",
                      color: current ? "var(--rust-ink)" : "var(--ink)",
                      borderRadius: 8,
                      padding: "10px 12px",
                      cursor: pending ? "wait" : current ? "default" : "pointer",
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                      {s.label}
                      {current ? " (current)" : ""}
                    </span>
                    <span style={{ display: "block", fontSize: "0.76rem", opacity: 0.85 }}>{s.hint}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {!readOnly && (
          <>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", margin: "16px 0 8px" }}>Dates</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.72rem", color: "var(--muted)" }}>
                Start
                <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setDatesSaved(false); }} style={dateInput} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "0.72rem", color: "var(--muted)" }}>
                Finish
                <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setDatesSaved(false); }} style={dateInput} />
              </label>
              <button
                disabled={pending || !datesChanged}
                onClick={saveDates}
                style={{ background: datesChanged ? "var(--rust)" : "var(--surface-2)", color: datesChanged ? "var(--rust-ink)" : "var(--muted)", border: "none", borderRadius: 6, padding: "9px 14px", fontWeight: 600, fontSize: "0.82rem", cursor: datesChanged && !pending ? "pointer" : "default" }}
              >
                {pending ? "Saving…" : "Save dates"}
              </button>
              {datesSaved && !datesChanged && <span style={{ color: "var(--active)", fontSize: "0.82rem", fontWeight: 600 }}>Saved</span>}
            </div>
          </>
        )}
        {error && <div style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: 10 }}>{error}</div>}
        <div style={{ marginTop: 16 }}>
          <ScheduleSection projectId={project.id} rows={sectionRows} names={names} taskNumbers={[]} defaultLocation={project.location || ""} readOnly={readOnly} />
        </div>
        <div style={{ marginTop: 14 }}>
          <Link href={`/projects/${project.id}`} style={{ fontSize: "0.85rem", color: "var(--ink-soft)", textDecoration: "underline" }}>
            Open project →
          </Link>
        </div>
      </div>
    </div>
  );
}

const dateInput: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.9rem", color: "var(--ink)", fontFamily: "inherit" };
