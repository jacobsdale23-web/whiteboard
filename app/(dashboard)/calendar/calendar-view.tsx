"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { computeBar, addDays, type GanttProject, type Bar } from "@/lib/gantt";
import GanttChart from "./gantt-chart";

type Mode = "timeline" | "week" | "day";

const DAY_MS = 86400000;
const BAR_COLORS: Record<string, string> = {
  "status-active": "var(--active)",
  "status-upcoming": "var(--upcoming)",
  "status-overdue": "var(--danger)",
  "status-complete": "var(--muted)",
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(d: Date): Date {
  const s = startOfDay(d);
  return addDays(s, -((s.getDay() + 6) % 7));
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

function fmt(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString("en-US", opts);
}

type Item = { project: GanttProject; bar: Bar };

function useItems(projects: GanttProject[]): Item[] {
  return useMemo(() => {
    const items: Item[] = [];
    for (const p of projects) {
      if (p.status === "complete") continue;
      const bar = computeBar(p);
      if (bar) items.push({ project: p, bar });
    }
    return items.sort((a, b) => a.bar.start.getTime() - b.bar.start.getTime());
  }, [projects]);
}

export default function CalendarView({ projects }: { projects: GanttProject[] }) {
  const [mode, setMode] = useState<Mode>("timeline");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const items = useItems(projects);

  const step = mode === "week" ? 7 : 1;
  const today = startOfDay(new Date());

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
          {(["timeline", "week", "day"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                border: "none",
                padding: "8px 16px",
                fontWeight: 600,
                fontSize: "0.85rem",
                cursor: "pointer",
                textTransform: "capitalize",
                background: mode === m ? "var(--rust)" : "var(--surface)",
                color: mode === m ? "var(--rust-ink)" : "var(--ink)",
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {mode !== "timeline" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NavButton onClick={() => setAnchor(addDays(anchor, -step))}>‹</NavButton>
            <NavButton onClick={() => setAnchor(today)}>Today</NavButton>
            <NavButton onClick={() => setAnchor(addDays(anchor, step))}>›</NavButton>
            <strong style={{ marginLeft: 6 }}>
              {mode === "week"
                ? `${fmt(startOfWeek(anchor), { month: "short", day: "numeric" })} – ${fmt(addDays(startOfWeek(anchor), 6), { month: "short", day: "numeric", year: "numeric" })}`
                : fmt(anchor, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </strong>
          </div>
        )}
      </div>

      {mode === "timeline" && <GanttChart projects={projects} />}
      {mode === "week" && <WeekView items={items} weekStart={startOfWeek(anchor)} today={today} />}
      {mode === "day" && <DayView items={items} day={anchor} />}
    </div>
  );
}

function NavButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--surface-2)",
        color: "var(--ink)",
        border: "none",
        borderRadius: 6,
        padding: "7px 14px",
        fontWeight: 600,
        fontSize: "0.85rem",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function WeekView({ items, weekStart, today }: { items: Item[]; weekStart: Date; today: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const visible = items.filter((x) => dayDiff(x.bar.end, weekStart) >= 0 && dayDiff(x.bar.start, weekStart) <= 6);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--surface)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "200px repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
        <div />
        {days.map((d) => {
          const isToday = dayDiff(d, today) === 0;
          return (
            <div
              key={d.getTime()}
              style={{
                padding: "10px 8px",
                textAlign: "center",
                borderLeft: "1px solid var(--border)",
                background: isToday ? "var(--surface-2)" : undefined,
                fontSize: "0.78rem",
                textTransform: "uppercase",
                color: isToday ? "var(--rust)" : "var(--muted)",
                fontWeight: 700,
              }}
            >
              {fmt(d, { weekday: "short" })}
              <div style={{ fontSize: "1.05rem", color: isToday ? "var(--rust)" : "var(--ink)" }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>

      {visible.map(({ project, bar }) => {
        const startCol = Math.max(0, dayDiff(bar.start, weekStart));
        const endCol = Math.min(6, dayDiff(bar.end, weekStart));
        return (
          <div
            key={project.id}
            style={{ display: "grid", gridTemplateColumns: "200px repeat(7, 1fr)", borderBottom: "1px solid var(--border)", minHeight: 52 }}
          >
            <div style={{ padding: "8px 14px", overflow: "hidden" }}>
              <Link href={`/projects/${project.id}`} style={{ color: "inherit", fontWeight: 600, fontSize: "0.85rem" }}>
                {project.name}
              </Link>
              {project.location && <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>{project.location}</div>}
              {!!project.crew?.length && <div style={{ fontSize: "0.72rem", color: "var(--ink-soft)" }}>{project.crew.join(", ")}</div>}
            </div>
            {days.map((d, i) => (
              <div
                key={i}
                style={{
                  gridColumn: i + 2,
                  gridRow: 1,
                  borderLeft: "1px solid var(--border)",
                  background: dayDiff(d, today) === 0 ? "var(--surface-2)" : undefined,
                }}
              />
            ))}
            <div
              style={{
                gridColumn: `${startCol + 2} / ${endCol + 3}`,
                gridRow: 1,
                alignSelf: "center",
                margin: "0 3px",
                height: 28,
                borderRadius: 6,
                background: BAR_COLORS[bar.cls],
                color: "#fff",
                display: "flex",
                alignItems: "center",
                padding: "0 10px",
                fontSize: "0.76rem",
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                zIndex: 1,
              }}
            >
              {project.name}
            </div>
          </div>
        );
      })}

      {!visible.length && <div style={{ color: "var(--muted)", padding: 20 }}>Nothing scheduled this week.</div>}
    </div>
  );
}

function DayView({ items, day }: { items: Item[]; day: Date }) {
  const visible = items.filter((x) => dayDiff(x.bar.start, day) <= 0 && dayDiff(x.bar.end, day) >= 0);

  if (!visible.length) {
    return <div style={{ color: "var(--muted)", padding: 20 }}>Nothing scheduled for this day.</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
      {visible.map(({ project, bar }) => {
        const starts = dayDiff(bar.start, day) === 0;
        const ends = dayDiff(bar.end, day) === 0;
        const dayNumber = dayDiff(day, bar.start) + 1;
        const totalDays = dayDiff(bar.end, bar.start) + 1;
        return (
          <div
            key={project.id}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderLeft: `4px solid ${BAR_COLORS[bar.cls]}`,
              borderRadius: 10,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <Link href={`/projects/${project.id}`} style={{ color: "inherit", textDecoration: "underline", fontWeight: 700 }}>
              {project.name}
            </Link>
            {project.location && <div style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{project.location}</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {starts && <DayTag>Starts today</DayTag>}
              {ends && <DayTag>Finishes today</DayTag>}
              {bar.cls === "status-overdue" && <DayTag>Overdue</DayTag>}
              {!bar.estimated && !starts && !ends && <DayTag>{`Day ${dayNumber} of ${totalDays}`}</DayTag>}
            </div>
            <Row label="Crew" value={project.crew?.length ? project.crew.join(", ") : "Unassigned"} />
            <Row label="Completion" value={project.endDate || "TBD"} />
          </div>
        );
      })}
    </div>
  );
}

function DayTag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background: "var(--surface-2)",
        color: "var(--ink-soft)",
        borderRadius: 20,
        padding: "3px 10px",
        fontSize: "0.72rem",
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", gap: 12 }}>
      <span style={{ color: "var(--muted)", fontSize: "0.72rem", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}
