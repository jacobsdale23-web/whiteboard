import Link from "next/link";
import { db } from "@/lib/db";
import { hrCandidates, hrDrugTests, hrEmployees, hrOqQuals } from "@/lib/db/schema";
import { requireHrPage } from "@/lib/hr-access";
import { OPEN_STAGES, PENDING_STATUSES, oqState, preEmploymentState, stageLabel, testTypeLabel, today } from "@/lib/hr";
import { card, chip, td, th } from "./hr-styles";

const daysSince = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso + "T00:00:00").getTime()) / 86400000)) : null);

export default async function HrOverviewPage() {
  const ws = await requireHrPage();
  const [candidates, employees, tests, quals] = await Promise.all([
    db.select().from(hrCandidates),
    db.select().from(hrEmployees),
    db.select().from(hrDrugTests),
    db.select().from(hrOqQuals),
  ]);

  const co = new Map(ws.allCompanies.map((c) => [c.id, c.shortName]));
  const empById = new Map(employees.map((e) => [e.id, e]));
  const candById = new Map(candidates.map((c) => [c.id, c]));
  const current = employees.filter((e) => e.status !== "terminated");

  const openCandidates = candidates.filter((c) => OPEN_STAGES.includes(c.stage));
  const waiting = tests
    .filter((t) => PENDING_STATUSES.includes(t.status))
    .map((t) => {
      const emp = t.employeeId ? empById.get(t.employeeId) : undefined;
      const cand = t.candidateId ? candById.get(t.candidateId) : undefined;
      return { t, name: emp?.name ?? cand?.name ?? "Unknown", href: emp ? `/hr/employees/${emp.id}` : cand ? `/hr/candidates/${cand.id}` : "/hr", company: co.get((emp ?? cand)?.companyId ?? "") ?? "" };
    })
    .sort((a, b) => (a.t.orderedDate ?? "").localeCompare(b.t.orderedDate ?? ""));

  // Candidates deep in the process with nothing cleared yet.
  const needTest = openCandidates
    .filter((c) => ["offer", "pre_hire"].includes(c.stage) && preEmploymentState(tests.filter((t) => t.candidateId === c.id)) !== "cleared");

  const now = today();
  const attention = quals
    .map((q) => ({ q, state: oqState(q.expiresDate, now), emp: empById.get(q.employeeId) }))
    .filter((x) => x.emp && x.emp.status !== "terminated" && (x.state === "expired" || x.state === "expiring"))
    .sort((a, b) => (a.q.expiresDate ?? "").localeCompare(b.q.expiresDate ?? ""));

  const stats = [
    { label: "Open candidates", value: openCandidates.length, href: "/hr/candidates" },
    { label: "Tests awaiting results", value: waiting.length, href: "#waiting" },
    { label: "Current employees", value: current.length, href: "/hr/employees" },
    { label: "In testing program", value: current.filter((e) => e.daProgram === "active").length, href: "/hr/employees?da=active" },
    { label: "Pending program entry", value: current.filter((e) => e.daProgram === "pending").length, href: "/hr/employees?da=pending" },
    { label: "OQs expired", value: attention.filter((a) => a.state === "expired").length, href: "#oq" },
    { label: "OQs expiring (60 days)", value: attention.filter((a) => a.state === "expiring").length, href: "#oq" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
        {stats.map((s) => (
          <Link key={s.label} href={s.href} style={{ ...card, marginBottom: 0, padding: 14, textDecoration: "none", color: "inherit" }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "var(--font-mono)" }}>{s.value}</div>
            <div style={{ fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)" }}>{s.label}</div>
          </Link>
        ))}
      </div>

      <div id="waiting" style={card}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 10 }}>Tests awaiting results</h3>
        {waiting.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Person</th>
                  <th style={th}>Company</th>
                  <th style={th}>Test</th>
                  <th style={th}>Ordered</th>
                  <th style={th}>Waiting</th>
                  <th style={th}>Clinic</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map(({ t, name, href, company }) => {
                  const d = daysSince(t.orderedDate);
                  return (
                    <tr key={t.id}>
                      <td style={td}>
                        <Link href={href} style={{ fontWeight: 600, color: "inherit" }}>
                          {name}
                        </Link>
                      </td>
                      <td style={td}>{company}</td>
                      <td style={td}>{testTypeLabel(t.testType)}</td>
                      <td style={td}>{t.orderedDate || "—"}</td>
                      <td style={td}>{d === null ? "—" : <span style={chip(d >= 5 ? "bad" : d >= 2 ? "warn" : "muted")}>{d} day{d === 1 ? "" : "s"}</span>}</td>
                      <td style={td}>{t.facility || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Nothing is waiting on a result.</p>
        )}
      </div>

      <div style={card}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 10 }}>Candidates close to hire without a cleared test</h3>
        {needTest.length ? (
          needTest.map((c) => (
            <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: "0.88rem" }}>
              <Link href={`/hr/candidates/${c.id}`} style={{ fontWeight: 600, color: "inherit" }}>
                {c.name}
              </Link>{" "}
              <span style={{ color: "var(--muted)" }}>
                · {co.get(c.companyId)} · {c.position || "no position"} · {stageLabel(c.stage)}
              </span>
            </div>
          ))
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Everyone at the offer / pre-hire stage is cleared.</p>
        )}
      </div>

      <div id="oq" style={card}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 10 }}>OQ qualifications needing attention</h3>
        {attention.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Employee</th>
                  <th style={th}>Task</th>
                  <th style={th}>Expires</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {attention.map(({ q, state, emp }) => (
                  <tr key={q.id}>
                    <td style={td}>
                      <Link href={`/hr/employees/${emp!.id}`} style={{ fontWeight: 600, color: "inherit" }}>
                        {emp!.name}
                      </Link>{" "}
                      <span style={{ color: "var(--muted)" }}>{co.get(emp!.companyId)}</span>
                    </td>
                    <td style={td}>
                      <strong>{q.taskCode}</strong> {q.taskName}
                    </td>
                    <td style={td}>{q.expiresDate}</td>
                    <td style={td}>
                      <span style={chip(state === "expired" ? "bad" : "warn")}>{state === "expired" ? "Expired" : "Expiring soon"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No OQ qualifications are expired or expiring in the next 60 days.</p>
        )}
      </div>
    </div>
  );
}
