"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipmentTickets } from "@/lib/db/schema";
import { getSessionAndProfile, canSeeEquipment } from "@/lib/auth/current-user";

const STATUSES = ["open", "in_progress", "resolved"];

// Server-enforced: only admins and mechanics can change a ticket.
export async function updateEquipmentTicket(id: string, status: string, mechanicNotes: string) {
  const current = await getSessionAndProfile();
  if (!current || !canSeeEquipment(current.profile)) throw new Error("Only mechanics and admins can update equipment tickets.");
  if (!STATUSES.includes(status)) throw new Error("Unknown status.");

  const existing = await db.query.equipmentTickets.findFirst({ where: eq(equipmentTickets.id, id) });
  if (!existing) throw new Error("Ticket not found.");

  await db
    .update(equipmentTickets)
    .set({
      status,
      mechanicNotes: mechanicNotes.trim() || null,
      resolvedAt: status === "resolved" ? existing.resolvedAt ?? new Date() : null,
    })
    .where(eq(equipmentTickets.id, id));
  revalidatePath("/equipment");
}
