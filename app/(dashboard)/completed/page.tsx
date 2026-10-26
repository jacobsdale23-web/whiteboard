import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { isSafetyViewer } from "@/lib/auth/current-user";
import { getWorkspace, requireCompany } from "@/lib/auth/company";
import CompletedList from "./completed-list";

export default async function CompletedPage() {
  const ws = await getWorkspace();
  const company = await requireCompany();
  const hideValue = !!ws && isSafetyViewer(ws.profile);
  const rows = await db.select().from(projects).where(and(inArray(projects.status, ["complete", "billed"]), eq(projects.companyId, company.id)));
  const completed = hideValue ? rows.map((p) => ({ ...p, value: null })) : rows;

  return (
    <section>
      <h2 style={{ marginBottom: 8 }}>Completed Projects</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 18 }}>
        Finished jobs — open one to pull historical Daily Logs, JSAs, Budget, or T&amp;M invoices. Jobs still waiting to be billed stay on the calendar until you mark them billed.
      </p>
      <CompletedList projects={completed} canEdit={!hideValue} />
    </section>
  );
}
