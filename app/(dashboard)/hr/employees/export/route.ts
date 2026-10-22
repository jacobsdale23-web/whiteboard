import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { canSeeHR, getSessionAndProfile } from "@/lib/auth/current-user";
import { loadRoster } from "@/lib/hr-data";
import { csvCell, daProgramLabel, employeeStatusLabel, testStatusLabel, testTypeLabel } from "@/lib/hr";

// Roster for audits: who is in the testing program and the state of their OQs.
export async function GET(req: Request) {
  const current = await getSessionAndProfile();
  if (!current || !canSeeHR(current.profile)) return new Response("Admins and HR only.", { status: 403 });

  const url = new URL(req.url);
  const company = url.searchParams.get("company") || "";
  const status = url.searchParams.get("status") || "current";
  const da = url.searchParams.get("da") || "";
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  const [roster, allCompanies] = await Promise.all([loadRoster(), db.select().from(companies)]);
  const names = new Map(allCompanies.map((c) => [c.id, c.name]));
  const rows = roster
    .filter(
      (e) =>
        (!company || e.companyId === company) &&
        (status === "all" || (status === "current" ? e.status !== "terminated" : e.status === status)) &&
        (!da || e.daProgram === da) &&
        (!q || `${e.name} ${e.position ?? ""}`.toLowerCase().includes(q))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const header = ["Employee", "Company", "Position", "Hire date", "Employment status", "Testing program", "Enrolled", "Latest test", "Latest test result", "Latest test date", "Pending tests", "OQ tasks", "OQ expiring soon", "OQ expired"];
  const lines = [header.map(csvCell).join(",")];
  for (const e of rows) {
    lines.push(
      [
        e.name,
        names.get(e.companyId) ?? e.companyId,
        e.position,
        e.hireDate,
        employeeStatusLabel(e.status),
        daProgramLabel(e.daProgram),
        e.daEnrolledDate,
        e.lastTest ? testTypeLabel(e.lastTest.testType) : "",
        e.lastTest ? testStatusLabel(e.lastTest.status) : "",
        e.lastTest?.date,
        e.pendingTests,
        e.oqTotal,
        e.oqExpiring,
        e.oqExpired,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return new Response("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="employee-roster-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
