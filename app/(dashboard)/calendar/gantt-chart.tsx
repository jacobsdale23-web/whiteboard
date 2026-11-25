"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { computeBar, addDays, startOfMonth, barColor, tapTag, type GanttProject, type Bar } from "@/lib/gantt";
import { JOB_KIND_COLORS, JOB_KIND_LABELS, oppTypeColor } from "@/lib/job-kinds";
import { crewFor, rangeLabel, shortDate, type SchedRow } from "@/lib/schedule";
import { formatMeetingTime } from "@/lib/meeting";
import type { CalendarEvent } from "./calendar-view";

const DAY_MS = 86400000;
const DAY_WIDTH = 7;
const ROW_H = 46;
const GROUP_H = 32;
const EVENT_H = 30; // meetings and bid due dates are single days, so their rows are slimmer

const eventTone = (e: CalendarEvent) => oppTypeColor(e.oppType) ?? (e.kind === "Meeting" ? "var(--shop)" : "var(--upcoming)");

type ProjectRow = { kind: "project"; project: GanttProject; left: number; width: number; cls: string; estimated: boolean };
type GroupRow = { kind: "group"; label: string };
type EventRow = { kind: "event"; event: CalendarEvent; left: number };
type GanttRow = ProjectRow | GroupRow | EventRow;

type Layout = {
  rows: GanttRow[];
  months: { label: string; left: number; width: number }[];
  totalWidth: number;
  totalHeight: number;
  todayX: number;
};

function buildLayout(projects: GanttProject[], events: CalendarEvent[], todayIso: string): Layout {
  // Meetings and bid due dates from today on, soonest first (timed meetings in order through the day).
  const coming = events
    .filter((e) => e.date >= todayIso)
    .sort((a, b) => `${a.date} ${a.time || "99:99"}`.localeCompare(`${b.date} ${b.time || "99:99"}`))
    .map((e) => ({ event: e, day: new Date(e.date + "T00:00:00") }));
  const current: { project: GanttProject; bar: Bar }[] = [];
  const upcoming: { project: GanttProject; bar: Bar }[] = [];
  for (const p of projects) {
    const bar = computeBar(p);
    if (!bar) continue;
    (p.status === "upcoming" ? upcoming : current).push({ project: p, bar });
  }
  const byFinish = (a: { bar: Bar }, b: { bar: Bar }) => a.bar.end.getTime() - b.bar.end.getTime();
  current.sort(byFinish);
  upcoming.sort(byFinish);

  const allBars = [...current, ...upcoming];
  if (!allBars.length && !coming.length) {
    return { rows: [], months: [], totalWidth: 0, totalHeight: 0, todayX: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let minDate = today;
  let maxDate = today;
  for (const x of allBars) {
    if (x.bar.start < minDate) minDate = x.bar.start;
    if (x.bar.end > maxDate) maxDate = x.bar.end;
  }
  for (const x of coming) if (x.day > maxDate) maxDate = x.day;
  const rangeStart = startOfMonth(addDays(minDate, -3));
  const rangeEndExclusive = startOfMonth(addDays(maxDate, 33));
  const xOf = (d: Date) => Math.round((d.getTime() - rangeStart.getTime()) / DAY_MS) * DAY_WIDTH;
  const totalWidth = xOf(rangeEndExclusive);

  const months: { label: string; left: number; width: number }[] = [];
  let cursor = new Date(rangeStart.getTime());
  while (cursor < rangeEndExclusive) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const left = xOf(cursor);
    const width = xOf(next < rangeEndExclusive ? next : rangeEndExclusive) - left;
    months.push({ label: cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" }), left, width });
    cursor = next;
  }

  const toRow = (x: { project: GanttProject; bar: Bar }): ProjectRow => ({
    kind: "project",
    project: x.project,
    left: xOf(x.bar.start),
    width: Math.max(xOf(x.bar.end) - xOf(x.bar.start), 10),
    cls: x.bar.cls,
    estimated: x.bar.estimated,
  });

  // Meetings and bids sit at the top, where they are seen without scrolling past every job.
  const rows: GanttRow[] = [];
  if (coming.length) {
    rows.push({ kind: "group", label: "Meetings & bids" });
    coming.forEach((x) => rows.push({ kind: "event", event: x.event, left: xOf(x.day) }));
    if (current.length) rows.push({ kind: "group", label: "Jobs" });
  }
  current.forEach((x) => rows.push(toRow(x)));
  if (upcoming.length) {
    if (current.length || coming.length) rows.push({ kind: "group", label: "Upcoming" });
    upcoming.forEach((x) => rows.push(toRow(x)));
  }

  let totalHeight = 0;
  for (const r of rows) totalHeight += r.kind === "group" ? GROUP_H : r.kind === "event" ? EVENT_H : ROW_H;

  return { rows, months, totalWidth, totalHeight, todayX: xOf(today) };
}

export default function GanttChart({ projects, events, crew, todayIso, onSelect }: { projects: GanttProject[]; events: CalendarEvent[]; crew: SchedRow[]; todayIso: string; onSelect: (id: string) => void }) {
  const layout = useMemo(() => buildLayout(projects, events, todayIso), [projects, events, todayIso]);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; project: GanttProject } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, layout.todayX - el.clientWidth * 0.25);
  }, [layout.todayX, layout.rows.length]);

  if (!layout.rows.length) {
    return <div style={{ color: "var(--muted)", padding: 20 }}>Nothing on the calendar yet.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginBottom: 14, fontSize: "0.8rem", color: "var(--ink-soft)" }}>
        <Legend color="var(--active)" label="Active" />
        <Legend color="var(--upcoming)" label="Upcoming" />
        <Legend color="var(--danger)" label="Overdue" />
        <Legend color="var(--hold, #b7791f)" label="On hold" />
        <Legend color="var(--muted)" label="Completed, not yet billed" />
        <Legend color={JOB_KIND_COLORS.hot_tap!} label={`${JOB_KIND_LABELS.hot_tap} (active or upcoming)`} />
        <Legend color={JOB_KIND_COLORS.fwi_hot_tap!} label={`${JOB_KIND_LABELS.fwi_hot_tap} (active or upcoming)`} />
        {!!events.length && (
          <>
            <Legend color="var(--shop)" label="Meeting" />
            <Legend color="var(--upcoming)" label="Bid due" />
          </>
        )}
      </div>
      <div
        style={{
          display: "flex",
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
          background: "var(--surface)",
        }}
      >
        <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid var(--border)" }}>
          <div style={{ height: 36, borderBottom: "1px solid var(--border)" }} />
          {layout.rows.map((r, i) =>
            r.kind === "group" ? (
              <div
                key={i}
                style={{
                  height: GROUP_H,
                  background: "var(--surface-2)",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  padding: "0 14px",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  fontWeight: 700,
                }}
              >
                {r.label}
              </div>
            ) : r.kind === "event" ? (
              <div key={i} style={{ height: EVENT_H, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 14px", overflow: "hidden" }}>
                <Link href={`/opportunities/${r.event.id}`} title={r.event.name} style={{ color: "inherit", textDecoration: "none", fontSize: "0.8rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.event.name}
                </Link>
              </div>
            ) : (
              <div
                key={i}
                style={{
                  height: ROW_H,
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  padding: "0 14px",
                  overflow: "hidden",
                }}
              >
                <div style={{ fontSize: "0.85rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {tapTag(r.project.jobKind) && <TapChip jobKind={r.project.jobKind} />}
                  {r.project.name}
                </div>
                {r.project.location && <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{r.project.location}</div>}
              </div>
            )
          )}
        </div>
        <div ref={scrollRef} style={{ overflowX: "auto", flex: 1 }}>
          <div style={{ position: "relative", width: layout.totalWidth }}>
            <div style={{ position: "relative", height: 36, borderBottom: "1px solid var(--border)" }}>
              {layout.months.map((m, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: m.left,
                    width: m.width,
                    borderLeft: "1px solid var(--border)",
                    fontSize: "0.72rem",
                    color: "var(--muted)",
                    padding: "9px 0 0 8px",
                    fontFamily: "var(--font-mono)",
                    textTransform: "uppercase",
                  }}
                >
                  {m.label}
                </div>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              {layout.rows.map((r, i) =>
                r.kind === "group" ? (
                  <div key={i} style={{ height: GROUP_H, background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }} />
                ) : r.kind === "event" ? (
                  <div key={i} style={{ position: "relative", height: EVENT_H, borderBottom: "1px solid var(--border)" }}>
                    <Link
                      href={`/opportunities/${r.event.id}`}
                      title={[
                        `${r.event.kind}: ${r.event.name}`,
                        `${shortDate(r.event.date)}${r.event.time ? ` at ${formatMeetingTime(r.event.time)}` : ""}`,
                        r.event.customer,
                        r.event.estimator ? `${r.event.kind === "Meeting" ? "Organizer" : "Estimator"}: ${r.event.estimator}` : "",
                        r.event.attendees?.length ? `Also: ${r.event.attendees.join(", ")}` : "",
                      ]
                        .filter(Boolean)
                        .join("\n")}
                      style={{ position: "absolute", top: 0, height: EVENT_H, left: r.left - 6, display: "flex", alignItems: "center", gap: 7, color: "var(--ink)", textDecoration: "none", whiteSpace: "nowrap", fontSize: "0.74rem", fontWeight: 600, zIndex: 1 }}
                    >
                      <span aria-hidden style={{ width: 11, height: 11, background: eventTone(r.event), transform: "rotate(45deg)", borderRadius: 2, flexShrink: 0 }} />
                      <span>
                        {shortDate(r.event.date)}
                        {r.event.time ? ` · ${formatMeetingTime(r.event.time)}` : ""}
                        <span style={{ color: eventTone(r.event), marginLeft: 6, textTransform: "uppercase", fontSize: "0.62rem", fontWeight: 700 }}>{r.event.kind}</span>
                      </span>
                    </Link>
                  </div>
                ) : (
                  <div key={i} style={{ position: "relative", height: ROW_H, borderBottom: "1px solid var(--border)" }}>
                    <div
                      onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, project: r.project })}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => {
                        setTooltip(null);
                        onSelect(r.project.id);
                      }}
                      style={{
                        position: "absolute",
                        top: 9,
                        left: r.left,
                        width: r.width,
                        height: 28,
                        borderRadius: 6,
                        background: barColor(r.cls, r.project.jobKind),
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 10px",
                        fontSize: "0.76rem",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        cursor: "pointer",
                        backgroundImage: r.estimated
                          ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.22) 0 6px, transparent 6px 12px)"
                          : undefined,
                      }}
                    >
                      {tapTag(r.project.jobKind) && <span style={{ opacity: 0.85, fontSize: "0.62rem", textTransform: "uppercase", marginRight: 6 }}>{tapTag(r.project.jobKind)}</span>}
                      {r.project.name}
                    </div>
                  </div>
                )
              )}
              <div style={{ position: "absolute", top: 0, left: layout.todayX, width: 2, height: layout.totalHeight, background: "var(--rust)" }}>
                <span
                  style={{
                    position: "absolute",
                    top: -1,
                    transform: "translateX(-50%)",
                    background: "var(--rust)",
                    color: "#fff",
                    fontSize: "0.62rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "2px 6px",
                    borderRadius: 3,
                    whiteSpace: "nowrap",
                  }}
                >
                  Today
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: Math.min(tooltip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 800) - 260),
            top: Math.min(tooltip.y + 14, (typeof window !== "undefined" ? window.innerHeight : 600) - 300),
            zIndex: 50,
            background: "var(--steel)",
            color: "var(--steel-ink)",
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: "0.82rem",
            maxWidth: 260,
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 2 }}>{tooltip.project.name}</div>
          {tooltip.project.location && (
            <div style={{ color: "#b7bec4", fontSize: "0.75rem", marginBottom: 8 }}>{tooltip.project.location}</div>
          )}
          <TooltipRow label="Completion" value={tooltip.project.endDate || "TBD"} />
          {tooltip.project.value !== null && (
            <TooltipRow
              label="Value"
              value={tooltip.project.value ? `$${Number(tooltip.project.value).toLocaleString()}` : "—"}
            />
          )}
          {(() => {
            const sched = crewFor(crew, tooltip.project.id, todayIso);
            if (!sched.length) return <TooltipRow label="Crew" value={tooltip.project.crew?.length ? tooltip.project.crew.join(", ") : "Unassigned"} />;
            return (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.18)" }}>
                <div style={{ color: "#a9b0b6", fontSize: "0.68rem", textTransform: "uppercase", marginBottom: 3 }}>Scheduled</div>
                {sched.slice(0, 8).map((r) => (
                  <div key={r.id} style={{ padding: "2px 0" }}>
                    <span style={{ fontWeight: 700 }}>{r.person}</span>
                    <span style={{ color: "#b7bec4", fontFamily: "var(--font-mono)", fontSize: "0.74rem" }}> · {rangeLabel(r)}</span>
                    {r.location && <div style={{ color: "#b7bec4", fontSize: "0.74rem" }}>{r.location}</div>}
                  </div>
                ))}
                {sched.length > 8 && <div style={{ color: "#b7bec4", fontSize: "0.74rem" }}>+ {sched.length - 8} more</div>}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Small colored tag in front of a tap job's name, so the kind shows even when the bar has a status color.
function TapChip({ jobKind }: { jobKind?: string | null }) {
  const label = tapTag(jobKind);
  const color = label === JOB_KIND_LABELS.fwi_hot_tap ? JOB_KIND_COLORS.fwi_hot_tap : JOB_KIND_COLORS.hot_tap;
  return (
    <span style={{ background: color!, color: "#fff", borderRadius: 4, padding: "1px 5px", fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", marginRight: 6 }}>{label}</span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "3px 0" }}>
      <span style={{ color: "#a9b0b6" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}
