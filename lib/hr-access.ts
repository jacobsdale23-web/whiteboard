import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { canSeeHR } from "@/lib/auth/current-user";
import { getWorkspace } from "@/lib/auth/company";

// Every HR page calls this first: the layout alone does not stop a page from
// running, and hiding the nav link is not protection.
export async function requireHrPage() {
  const ws = await getWorkspace();
  if (!ws || !canSeeHR(ws.profile)) redirect("/board");
  // HR is one combined list: every company, whatever the person's board access.
  const allCompanies = await db.select().from(companies).orderBy(asc(companies.sortOrder));
  return { ...ws, allCompanies };
}
