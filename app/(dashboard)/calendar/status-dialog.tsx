"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setProjectStatus } from "../board/actions";
import type { GanttProject } from "@/lib/gantt";

const STATUS_CHOICES = [
  { value: "upcoming", label: "Upcoming", hint: "Not started yet" },
  { value: "active", label: "Active", hint: "Crew is working it" },
  { value: "on_hold", label: "On hold", hint: "Paused; we'll come back to it. Stays on the calendar and board in its own color" },
  { value: "complete", label: "Complete", hint: "Done; stays on the calendar until billed" },
  { value: "billed", label: "Billed", hint: "Invoiced; moves to Completed and leaves the calendar" },
  { value: "canceled", label: "Canceled", hint: "Won't happen; moves to Completed (Canceled tab) and leaves the calendar" },
];

// Opened by clicking a job on the timeline, week or day view.
export default function StatusDialog({ project, readOnly, onClose }: { project: GanttProject; readOnly: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

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
        style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px", width: "100%", maxWidth: 420, boxShadow: "0 16px 48px rgba(0,0,0,0.35)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{project.name}</div>
            {project.location && <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{project.location}</div>}
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
        {error && <div style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: 10 }}>{error}</div>}
        <div style={{ marginTop: 14 }}>
          <Link href={`/projects/${project.id}`} style={{ fontSize: "0.85rem", color: "var(--ink-soft)", textDecoration: "underline" }}>
            Open project →
          </Link>
        </div>
      </div>
    </div>
  );
}
