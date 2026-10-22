import { db } from "@/lib/db";
import { hrDrugTests, hrEmployees, hrOqQuals } from "@/lib/db/schema";
import { latestTest, oqState } from "@/lib/hr";

export type RosterRow = {
  id: string;
  companyId: string;
  name: string;
  position: string | null;
  status: string;
  hireDate: string | null;
  daProgram: string;
  daEnrolledDate: string | null;
  lastTest: { testType: string; status: string; date: string } | null;
  pendingTests: number;
  oqTotal: number;
  oqExpiring: number;
  oqExpired: number;
};

// One summary row per employee: program status, latest test, and OQ health.
export async function loadRoster(): Promise<RosterRow[]> {
  const [employees, tests, quals] = await Promise.all([db.select().from(hrEmployees), db.select().from(hrDrugTests), db.select().from(hrOqQuals)]);
  return employees.map((e) => {
    const mine = tests.filter((t) => t.employeeId === e.id);
    const last = latestTest(mine.filter((t) => t.status !== "cancelled"));
    const q = quals.filter((x) => x.employeeId === e.id);
    const states = q.map((x) => oqState(x.expiresDate));
    return {
      id: e.id,
      companyId: e.companyId,
      name: e.name,
      position: e.position,
      status: e.status,
      hireDate: e.hireDate,
      daProgram: e.daProgram,
      daEnrolledDate: e.daEnrolledDate,
      lastTest: last ? { testType: last.testType, status: last.status, date: last.resultDate || last.collectedDate || last.orderedDate || last.createdAt.toISOString().slice(0, 10) } : null,
      pendingTests: mine.filter((t) => t.status === "ordered" || t.status === "collected").length,
      oqTotal: q.length,
      oqExpiring: states.filter((s) => s === "expiring").length,
      oqExpired: states.filter((s) => s === "expired").length,
    };
  });
}
