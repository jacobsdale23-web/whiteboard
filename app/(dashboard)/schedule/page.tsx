import Link from "next/link";
import { and, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { crewSchedule, projects } from "@/lib/db/schema";
import { getSessionAndProfile, isSafetyViewer } from "@/lib/auth/current-user";
import { requireCompany } from "@/lib/auth/company";
import { getPeople } from "@/lib/people";
import { addDays, coversDay, findConflicts, mondayOf, shortDate, weekDays, type SchedRow } from "@/lib/schedule";
import AddSchedule from "./add-schedule";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const company = await requireCompany();
  const current = await getSessionAndProfile();
  const readOnly = !!current && isSafetyViewer(current.profile);
  const sp = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const asked = sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? sp.w : today;
  const monday = mondayOf(asked);
  const days = weekDays(monday);
  const sunday = days[6];

  // Everything that touches this week, plus anything that could clash with it (the same rows), across all of the company's jobs.
  const rowsRaw = await db
    .select()
    .from(crewSchedule)
    .where(and(eq(crewSchedule.companyId, company.id), lte(crewSchedule.startDate, sunday), gte(crewSchedule.endDate, monday)));
  const rows: SchedRow[] = rowsRaw.map((r) => ({ id: r.id, projectId: r.projectId, person: r.person, startDate: r.startDate, endDate: r.endDate, location: r.location, taskNumber: r.taskNumber, note: r.note }));
  const jobIds = [...new Set(rows.map((r) => r.projectId))];
  const [jobs, openJobs, people] = await Promise.all([
    jobIds.length ? db.select({ id: projects.id, name: projects.name, customer: projects.customer }).from(projects).where(inArray(projects.id, jobIds)) : Promise.resolve([]),
    readOnly ? Promise.resolve([]) : db.select({ id: projects.id, name: projects.name, customer: projects.customer }).from(projects).where(and(eq(projects.companyId, company.id), notInArray(projects.status, ["complete", "billed", "canceled"]))),
    getPeople(company.id),
  ]);
  const jobName = new Map(jobs.map((j) => [j.id, j.name]));
  const conflicts = findConflicts(rows);

  const byPerson = new Map<string, SchedRow[]>();
  for (const r of rows) byPerson.set(r.person, [...(byPerson.get(r.person) || []), r]);
  const people_ = [...byPerson.keys()].sort((a, b) => a.localeCompare(b));
  const clashCount = new Set([...conflicts.values()].flat().map((r) => r.person.toLowerCase())).size;

  const label = `${shortDate(monday)} to ${shortDate(sunday)}`;
  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <h2>Schedule</h2>
        {!readOnly && <AddSchedule projects={openJobs.sort((a, b) => a.name.localeCompare(b.name)).map((j) => ({ id: j.id, name: j.customer ? `${j.name} · ${j.customer}` : j.name }))} names={people.names} defaultStart={monday <= today && today <= sunday ? today : monday} />}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Link href={`/schedule?w=${addDays(monday, -7)}`} style={navBtn}>
          ← Last week
        </Link>
        <strong style={{ fontFamily: "var(--font-mono)", fontSize: "0.95rem" }}>{label}</strong>
        <Link href={`/schedule?w=${addDays(monday, 7)}`} style={navBtn}>
          Next week →
        </Link>
        {monday !== mondayOf(today) && (
          <Link href="/schedule" style={navBtn}>
            This week
          </Link>
        )}
      </div>

      {clashCount > 0 && (
        <p style={{ border: "1px solid var(--danger)", borderLeftWidth: 4, borderRadius: 8, padding: "10px 12px", fontSize: "0.88rem", color: "var(--danger)", marginBottom: 14 }}>
          {clashCount} {clashCount === 1 ? "person is" : "people are"} scheduled on two different jobs the same day. Those days are outlined in red.
        </p>
      )}

      {!people_.length ? (
        <p style={{ color: "var(--muted)" }}>Nobody is scheduled this week.{!readOnly && " Use “+ Schedule someone” to add a welder or crew."}</p>
      ) : (
        <div style={{ overflowX: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 130, textAlign: "left" }}>Who</th>
                {days.map((d, i) => (
                  <th key={d} style={{ ...th, background: d === today ? "var(--upcoming-bg)" : i > 4 ? "var(--surface-2)" : undefined }}>
                    {DOW[i]} <span style={{ fontWeight: 400 }}>{shortDate(d).slice(0, -3)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people_.map((p) => (
                <tr key={p}>
                  <td style={{ ...td, fontWeight: 700 }}>{p}</td>
                  {days.map((d) => {
                    const here = (byPerson.get(p) || []).filter((r) => coversDay(r, d));
                    const clash = here.length > 1 && new Set(here.map((r) => r.projectId)).size > 1;
                    return (
                      <td key={d} style={{ ...td, outline: clash ? "2px solid var(--danger)" : undefined, outlineOffset: -2 }}>
                        {here.map((r) => (
                          <Link key={r.id} href={`/projects/${r.projectId}`} style={{ display: "block", textDecoration: "none", color: "inherit", background: "var(--upcoming-bg)", borderRadius: 6, padding: "4px 6px", marginBottom: 3, fontSize: "0.76rem", lineHeight: 1.25 }}>
                            <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{jobName.get(r.projectId) || "Job"}</div>
                            {r.location && <div style={{ color: "var(--ink-soft)", overflowWrap: "anywhere" }}>{r.location}</div>}
                            {r.taskNumber && <div style={{ color: "var(--muted)" }}>PO {r.taskNumber}</div>}
                          </Link>
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
      <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: 10 }}>Click a block to open the job and edit who is going. Everything is added from the job&apos;s Schedule section or the button above.</p>
    </section>
  );
}

const navBtn: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", textDecoration: "none", borderRadius: 6, padding: "7px 12px", fontWeight: 600, fontSize: "0.82rem" };
const th: React.CSSProperties = { padding: "8px 6px", fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", borderBottom: "1px solid var(--border)", textAlign: "center" };
const td: React.CSSProperties = { padding: 6, verticalAlign: "top", borderBottom: "1px solid var(--border)", borderLeft: "1px solid var(--border)", fontSize: "0.85rem" };
