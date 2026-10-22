import { db } from "@/lib/db";
import { opportunities, projects } from "@/lib/db/schema";
import { getSessionAndProfile, isSafetyViewer } from "@/lib/auth/current-user";
import CalendarView from "./calendar-view";

export default async function CalendarPage() {
  const current = await getSessionAndProfile();
  const readOnly = !!current && isSafetyViewer(current.profile);
  const [allProjects, allOpportunities] = await Promise.all([
    db.select().from(projects),
    // Bids and meetings are estimating data; a safety coordinator doesn't see them.
    readOnly ? Promise.resolve([]) : db.select().from(opportunities),
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
          value: readOnly ? null : p.value,
          crew: p.crew,
        }))}
      />
    </section>
  );
}
