import { db } from "@/lib/db";
import { opportunities, projects } from "@/lib/db/schema";
import CalendarView from "./calendar-view";

export default async function CalendarPage() {
  const [allProjects, allOpportunities] = await Promise.all([
    db.select().from(projects),
    db.select().from(opportunities),
  ]);

  const events = allOpportunities
    .filter((o) => o.bidDueDate && o.bidStatus !== "Lost" && o.bidStatus !== "Abandoned")
    .map((o) => ({
      id: o.id,
      name: o.jobName,
      location: o.location,
      date: o.bidDueDate as string,
      kind: o.kind === "Meeting" ? ("Meeting" as const) : ("Bid Due" as const),
      customer: o.customer,
      estimator: o.estimator,
    }));

  return (
    <section>
      <h2 style={{ marginBottom: 16 }}>Calendar</h2>
      <CalendarView
        events={events}
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
