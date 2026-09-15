import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import CompletedList from "./completed-list";

export default async function CompletedPage() {
  const completed = await db.select().from(projects).where(eq(projects.status, "complete"));

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
