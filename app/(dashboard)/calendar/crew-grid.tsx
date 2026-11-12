"use client";

import { useState } from "react";
import { addDays, coversDay, findConflicts, shortDate, type SchedRow } from "@/lib/schedule";
import ScheduleForm from "./schedule-form";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Where every welder is, day by day: people down the side, the week across, each block the job and location.
// Click a block to open that job (change its status or the schedule); click an empty day to put that person somewhere.
export default function CrewGrid({
  crew,
  projectNames,
  jobOptions,
  names,
  weekStart,
  today,
  readOnly,
  onSelect,
}: {
  crew: SchedRow[];
  projectNames: Record<string, string>;
  jobOptions: { id: string; name: string }[];
  names: string[];
  weekStart: Date;
  today: Date;
  readOnly: boolean;
  onSelect: (projectId: string) => void;
}) {
  const [adding, setAdding] = useState<{ person: string; date: string } | null>(null);
  const monday = isoOf(weekStart);
  const sunday = isoOf(addDays(weekStart, 6));
  const todayIso = isoOf(today);
  const days = Array.from({ length: 7 }, (_, i) => isoOf(addDays(weekStart, i)));

  const week = crew.filter((r) => r.startDate <= sunday && r.endDate >= monday);
  const conflicts = findConflicts(week);
  const byPerson = new Map<string, SchedRow[]>();
  for (const r of week) byPerson.set(r.person, [...(byPerson.get(r.person) || []), r]);
  const people = [...byPerson.keys()].sort((a, b) => a.localeCompare(b));
  const clashPeople = new Set([...conflicts.keys()].map((id) => week.find((r) => r.id === id)?.person).filter(Boolean));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", margin: 0 }}>
          Where each welder and crew member is this week. Click a block to open the job{readOnly ? "" : "; click an empty day to send someone there"}.
        </p>
        {!readOnly && !adding && (
          <button onClick={() => setAdding({ person: "", date: days[0] <= todayIso && todayIso <= days[6] ? todayIso : days[0] })} style={primaryBtn}>
            + Schedule someone
          </button>
        )}
      </div>

      {adding && (
        <div style={{ maxWidth: 560, marginBottom: 14 }}>
          <ScheduleForm key={`${adding.person}-${adding.date}`} projects={jobOptions} names={names} defaultStart={adding.date} defaultPerson={adding.person} onDone={() => setAdding(null)} />
        </div>
      )}

      {clashPeople.size > 0 && (
        <p style={{ border: "1px solid var(--danger)", borderLeftWidth: 4, borderRadius: 8, padding: "10px 12px", fontSize: "0.88rem", color: "var(--danger)", marginBottom: 12 }}>
          {clashPeople.size} {clashPeople.size === 1 ? "person is" : "people are"} scheduled on two different jobs the same day. Those days are outlined in red.
        </p>
      )}

      {!people.length ? (
        <div style={{ color: "var(--muted)", padding: 20, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}>Nobody is scheduled this week.</div>
      ) : (
        <div style={{ overflowX: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 880, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 140, textAlign: "left", paddingLeft: 14 }}>Who</th>
                {days.map((d, i) => (
                  <th key={d} style={{ ...th, background: d === todayIso ? "var(--surface-2)" : undefined, color: d === todayIso ? "var(--rust)" : "var(--muted)" }}>
                    {DOW[i]} <span style={{ fontWeight: 400 }}>{shortDate(d).slice(0, -3)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p}>
                  <td style={{ ...td, fontWeight: 700, paddingLeft: 14 }}>{p}</td>
                  {days.map((d, i) => {
                    const here = (byPerson.get(p) || []).filter((r) => coversDay(r, d));
                    const clash = new Set(here.map((r) => r.projectId)).size > 1;
                    return (
                      <td
                        key={d}
                        onClick={!readOnly && !here.length ? () => setAdding({ person: p, date: d }) : undefined}
                        title={!readOnly && !here.length ? `Schedule ${p} on ${shortDate(d)}` : undefined}
                        style={{ ...td, background: d === todayIso ? "var(--surface-2)" : i > 4 && !here.length ? "var(--surface-2)" : undefined, outline: clash ? "2px solid var(--danger)" : undefined, outlineOffset: -2, cursor: !readOnly && !here.length ? "pointer" : undefined }}
                      >
                        {here.map((r) => (
                          <div
                            key={r.id}
                            onClick={() => onSelect(r.projectId)}
                            title={[r.note, "Click to open the job"].filter(Boolean).join(" — ")}
                            style={{ cursor: "pointer", background: "var(--upcoming-bg)", borderRadius: 6, padding: "4px 6px", marginBottom: 3, fontSize: "0.76rem", lineHeight: 1.25 }}
                          >
                            <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{projectNames[r.projectId] || "Job"}</div>
                            {r.location && <div style={{ color: "var(--ink-soft)", overflowWrap: "anywhere" }}>{r.location}</div>}
                            {r.taskNumber && <div style={{ color: "var(--muted)" }}>PO {r.taskNumber}</div>}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const th: React.CSSProperties = { padding: "8px 6px", fontSize: "0.74rem", textTransform: "uppercase", borderBottom: "1px solid var(--border)", textAlign: "center" };
const td: React.CSSProperties = { padding: 6, verticalAlign: "top", borderBottom: "1px solid var(--border)", borderLeft: "1px solid var(--border)", fontSize: "0.85rem", height: 56 };
