import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import GanttChart from "./gantt-chart";

export default async function CalendarPage() {
  const allProjects = await db.select().from(projects);

  return (
    <section>
      <h2 style={{ marginBottom: 16 }}>Calendar</h2>
      <GanttChart
        projects={allProjects.map((p) => ({
          id: p.id,
          name: p.name,
          location: p.location,
          status: p.status,
          startDate: p.startDate,
          endDate: p.endDate,
          duration: p.duration,
          value: p.value,
          crew: p.crew,
        }))}
      />
    </section>
  );
}
