"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipmentTickets, equipmentTicketUpdates } from "@/lib/db/schema";
import { getSessionAndProfile, canSeeEquipment } from "@/lib/auth/current-user";

const STATUSES = ["open", "in_progress", "resolved"];

// Server-enforced: only admins and mechanics can change a ticket. Every save
// is logged with who did it, and resolving requires saying what was done.
export async function updateEquipmentTicket(id: string, status: string, note: string) {
  const current = await getSessionAndProfile();
  if (!current || !canSeeEquipment(current.profile)) throw new Error("Only mechanics and admins can update equipment tickets.");
  if (!STATUSES.includes(status)) throw new Error("Unknown status.");

  const existing = await db.query.equipmentTickets.findFirst({ where: eq(equipmentTickets.id, id) });
  if (!existing) throw new Error("Ticket not found.");

  const cleanNote = note.trim();
  if (status === "resolved" && !cleanNote && !existing.resolution) {
    throw new Error("Describe what was done to fix it before marking this resolved.");
  }
  if (!cleanNote && status === existing.status) throw new Error("Add a note or change the status.");

  const author = current.profile.name;
  await db.insert(equipmentTicketUpdates).values({ id: randomUUID(), ticketId: id, author, status, note: cleanNote || null });

  await db
    .update(equipmentTickets)
    .set({
      status,
      mechanicNotes: cleanNote || existing.mechanicNotes,
      ...(status === "resolved"
        ? { resolvedAt: existing.resolvedAt ?? new Date(), resolvedBy: author, resolution: cleanNote || existing.resolution }
        : { resolvedAt: null, resolvedBy: null, resolution: null }),
    })
    .where(eq(equipmentTickets.id, id));

  revalidatePath("/equipment");
  revalidatePath("/equipment/history");
}
