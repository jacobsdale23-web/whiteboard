import Link from "next/link";
import { requireHrPage } from "@/lib/hr-access";
import { loadRoster } from "@/lib/hr-data";
import { DA_PROGRAM, EMPLOYEE_STATUSES, daProgramLabel, employeeStatusLabel, testStatusLabel, testTypeLabel } from "@/lib/hr";
import EmployeeForm from "../employee-form";
import { ImportCrew } from "../row-controls";
import { chip, input, td, th, type Tone } from "../hr-styles";

const DA_TONE: Record<string, Tone> = { active: "good", pending: "warn", inactive: "muted" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ company?: string; status?: string; da?: string; q?: string }> }) {
  const ws = await requireHrPage();
  const { company = "", status = "current", da = "", q = "" } = await searchParams;

  const roster = await loadRoster();
  const companyName = new Map(ws.allCompanies.map((c) => [c.id, c.shortName]));
  const needle = q.trim().toLowerCase();
  const rows = roster
    .filter(
      (e) =>
        (!company || e.companyId === company) &&
        (status === "all" || (status === "current" ? e.status !== "terminated" : e.status === status)) &&
        (!da || e.daProgram === da) &&
        (!needle || `${e.name} ${e.position ?? ""}`.toLowerCase().includes(needle))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const exportQs = new URLSearchParams({ company, status, da, q }).toString();

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="q" defaultValue={q} placeholder="Search name or position" style={{ ...input, width: 200 }} />
          <select name="company" defaultValue={company} style={{ ...input, width: "auto" }}>
            <option value="">All companies</option>
            {ws.allCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} style={{ ...input, width: "auto" }}>
            <option value="current">Active + on leave</option>
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label} only
              </option>
            ))}
            <option value="all">Everyone</option>
          </select>
          <select name="da" defaultValue={da} style={{ ...input, width: "auto" }}>
            <option value="">Any testing status</option>
            {DA_PROGRAM.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" style={{ ...input, width: "auto", cursor: "pointer", fontWeight: 600 }}>
            Filter
          </button>
        </form>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href={`/hr/employees/export?${exportQs}`} style={{ ...input, width: "auto", textDecoration: "none", fontWeight: 600 }}>
            Export CSV
          </a>
          <EmployeeForm companies={ws.allCompanies.map((c) => ({ id: c.id, name: c.name }))} defaultCompanyId={company || ws.active?.id || "fwi"} />
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, overflowX: "auto", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Employee</th>
              <th style={th}>Company</th>
              <th style={th}>Status</th>
              <th style={th}>Testing program</th>
              <th style={th}>Latest test</th>
              <th style={th}>OQ qualifications</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id}>
                <td style={td}>
                  <Link href={`/hr/employees/${e.id}`} style={{ fontWeight: 600, color: "inherit" }}>
                    {e.name}
                  </Link>
                  <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>{e.position || "—"}</div>
                </td>
                <td style={td}>{companyName.get(e.companyId) ?? e.companyId}</td>
                <td style={td}>
                  <span style={chip(e.status === "active" ? "good" : e.status === "leave" ? "warn" : "muted")}>{employeeStatusLabel(e.status)}</span>
                </td>
                <td style={td}>
                  <span style={chip(DA_TONE[e.daProgram] ?? "muted")}>{daProgramLabel(e.daProgram).split(" (")[0]}</span>
                  {e.daEnrolledDate && e.daProgram === "active" && <div style={{ color: "var(--muted)", fontSize: "0.74rem" }}>since {e.daEnrolledDate}</div>}
                </td>
                <td style={td}>
                  {e.lastTest ? (
                    <>
                      {testTypeLabel(e.lastTest.testType)}
                      <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
                        {testStatusLabel(e.lastTest.status).split(",")[0]} · {e.lastTest.date}
                      </div>
                    </>
                  ) : (
                    "—"
                  )}
                  {e.pendingTests > 0 && <div style={{ ...chip("warn"), marginTop: 4 }}>{e.pendingTests} pending</div>}
                </td>
                <td style={td}>
                  {e.oqTotal ? (
                    <>
                      {e.oqTotal} task{e.oqTotal === 1 ? "" : "s"}
                      {e.oqExpired > 0 && <span style={{ ...chip("bad"), marginLeft: 6 }}>{e.oqExpired} expired</span>}
                      {e.oqExpiring > 0 && <span style={{ ...chip("warn"), marginLeft: 6 }}>{e.oqExpiring} expiring</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ ...td, color: "var(--muted)" }}>
                  {roster.length ? "No employees match." : "No employees yet. Add one above, or import the names already used for daily logs."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
        {rows.length} shown · <ImportCrew companies={ws.allCompanies.map((c) => ({ id: c.id, name: c.name }))} />
      </div>
    </div>
  );
}
