import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionAndProfile, isSafetyViewer } from "@/lib/auth/current-user";
import CompletedList from "./completed-list";

export default async function CompletedPage() {
  const current = await getSessionAndProfile();
  const hideValue = !!current && isSafetyViewer(current.profile);
  const rows = await db.select().from(projects).where(eq(projects.status, "complete"));
  const completed = hideValue ? rows.map((p) => ({ ...p, value: null })) : rows;

  return (
    <section>
      <h2 style={{ marginBottom: 8 }}>Completed Projects</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 18 }}>
        Archive of finished jobs — open one to pull historical Daily Logs, JSAs, Budget, or T&amp;M invoices.
      </p>
      <CompletedList projects={completed} />
    </section>
  );
}
