import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectManagers } from "@/lib/db/schema";

export const cleanPmName = (s: string) => s.trim().replace(/\s+/g, " ").slice(0, 60);

// The names a job's PM can be picked from (active ones, A to Z).
export async function getPmPool(): Promise<string[]> {
  const rows = await db.select().from(projectManagers).where(eq(projectManagers.active, true)).orderBy(asc(projectManagers.name));
  return rows.map((r) => r.name);
}
