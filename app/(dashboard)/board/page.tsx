import { db } from "@/lib/db";
import { projects, crew } from "@/lib/db/schema";
import { getSessionAndProfile, isSafetyViewer } from "@/lib/auth/current-user";
import BoardView from "./board-view";

export default async function BoardPage() {
  const current = await getSessionAndProfile();
  const readOnly = !!current && isSafetyViewer(current.profile);
  const allProjects = await db.select().from(projects);
  const allCrew = await db.select().from(crew);

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
  const completed = allProjects
    .filter((p) => p.status === "complete")
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
      completed={completed}
      foremen={foremen.map((c) => ({ id: c.id, name: c.name }))}
      atShop={atShop.map((c) => ({ id: c.id, name: c.name }))}
      readOnly={readOnly}
    />
  );
}
