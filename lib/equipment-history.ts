import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipmentTickets, equipmentTicketCosts, projects } from "@/lib/db/schema";

export type HistoryRow = {
  id: string;
  reportedDate: string;
  equipment: string;
  projectId: string;
  project: string;
  reportedBy: string;
  urgency: string;
  status: string;
  problem: string;
  suspectedCause: string | null;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolution: string | null;
  hoursDown: number | null; // from the moment it was reported until it was resolved
  partsCost: number; // sum of the parts invoices attached to the ticket
};

export async function loadEquipmentHistory(companyId: string): Promise<HistoryRow[]> {
  const [tickets, allProjects, costs] = await Promise.all([
    db.select().from(equipmentTickets).where(eq(equipmentTickets.companyId, companyId)),
    db.select().from(projects).where(eq(projects.companyId, companyId)),
    db.select().from(equipmentTicketCosts),
  ]);
  const costByTicket = new Map<string, number>();
  for (const c of costs) costByTicket.set(c.ticketId, (costByTicket.get(c.ticketId) || 0) + Number(c.amount));
  const label = new Map(allProjects.map((p) => [p.id, p.projectNumber ? `${p.projectNumber} ${p.name}` : p.name]));
  return tickets
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((t) => ({
      id: t.id,
      reportedDate: t.date,
      equipment: t.equipment,
      projectId: t.projectId,
      project: label.get(t.projectId) || "Unknown project",
      reportedBy: t.reportedBy,
      urgency: t.urgency,
      status: t.status,
      problem: t.problem,
      suspectedCause: t.suspectedCause,
      resolvedAt: t.resolvedAt,
      resolvedBy: t.resolvedBy,
      resolution: t.resolution,
      hoursDown: t.resolvedAt ? Math.max(0, (t.resolvedAt.getTime() - t.createdAt.getTime()) / 3600000) : null,
      partsCost: costByTicket.get(t.id) || 0,
    }));
}

export function formatDowntime(hours: number | null): string {
  if (hours === null) return "";
  if (hours < 1) return "under 1 hr";
  if (hours < 48) return `${Math.round(hours)} hr`;
  return `${(hours / 24).toFixed(1)} days`;
}
