import { db } from "@/lib/db";
import { projects, crew } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isSafetyViewer } from "@/lib/auth/current-user";
import { getWorkspace, requireCompany } from "@/lib/auth/company";
import BoardView from "./board-view";

export default async function BoardPage() {
  const ws = await getWorkspace();
  const company = await requireCompany();
  const readOnly = !!ws && isSafetyViewer(ws.profile);
  const allProjects = await db.select().from(projects).where(eq(projects.companyId, company.id));
  const allCrew = await db.select().from(crew).where(eq(crew.companyId, company.id));

  const toBoard = (p: (typeof allProjects)[number]) => ({
    id: p.id,
    name: p.name,
    location: p.location,
    status: p.status,
    startDate: p.startDate,
    endDate: p.endDate,
    duration: p.duration,
    value: readOnly ? null : p.value,
    crew: p.crew,
    billingType: p.billingType,
    projectNumber: p.projectNumber,
    customer: p.customer,
  });

  const active = allProjects.filter((p) => p.status === "active");
  const upcoming = allProjects.filter((p) => p.status === "upcoming");
  const onHold = allProjects.filter((p) => p.status === "on_hold");
  const completed = allProjects
    .filter((p) => p.status === "complete" || p.status === "billed" || p.status === "canceled")
    .sort((a, b) => (b.endDate || "").localeCompare(a.endDate || ""))
    .map((p) => ({ id: p.id, name: p.name, projectNumber: p.projectNumber, location: p.location, customer: p.customer, endDate: p.endDate }));
  // Individual crew workers (e.g. Jackson's T&M roster) stay in the crew
  // table for daily-log entry, but only foremen are ever displayed here.
  const foremen = allCrew.filter((c) => c.role === "foreman");
  const assignedNames = new Set(active.flatMap((p) => p.crew || []));
  const atShop = foremen.filter((c) => !assignedNames.has(c.name));

  return (
    <BoardView
      active={active.map(toBoard)}
      upcoming={upcoming.map(toBoard)}
      onHold={onHold.map(toBoard)}
      completed={completed}
      foremen={foremen.map((c) => ({ id: c.id, name: c.name }))}
      atShop={atShop.map((c) => ({ id: c.id, name: c.name }))}
      readOnly={readOnly}
    />
  );
}
