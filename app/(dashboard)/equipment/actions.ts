"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipmentTickets, equipmentTicketUpdates, equipmentTicketCosts } from "@/lib/db/schema";
import { deleteObject } from "@/lib/storage/s3";
import { getSessionAndProfile, canSeeEquipment } from "@/lib/auth/current-user";

const STATUSES = ["open", "in_progress", "resolved"];

const URGENCIES = ["down", "repair_soon", "minor"];

// Fix typos / a wrong severity on the ticket itself. Logged in the update list
// so the history stays honest about the ticket having been changed.
export async function editEquipmentTicket(
  id: string,
  data: { equipment: string; urgency: string; problem: string; suspectedCause: string }
): Promise<{ error?: string }> {
  const current = await getSessionAndProfile();
  if (!current || !canSeeEquipment(current.profile)) return { error: "Only mechanics and admins can edit equipment tickets." };

  const existing = await db.query.equipmentTickets.findFirst({ where: eq(equipmentTickets.id, id) });
  if (!existing) return { error: "Ticket not found." };

  const equipment = data.equipment.trim();
  const problem = data.problem.trim();
  if (!equipment || !problem) return { error: "Equipment and what's wrong are both required." };
  if (!URGENCIES.includes(data.urgency)) return { error: "Unknown severity." };

  await db
    .update(equipmentTickets)
    .set({ equipment, problem, urgency: data.urgency, suspectedCause: data.suspectedCause.trim() || null })
    .where(eq(equipmentTickets.id, id));
  await db
    .insert(equipmentTicketUpdates)
    .values({ id: randomUUID(), ticketId: id, author: current.profile.name, status: existing.status, note: "Edited the ticket details." });

  revalidatePath("/equipment");
  revalidatePath("/equipment/history");
  return {};
}

// Deleting erases the repair record, so it is admins only (server-checked).
export async function deleteEquipmentTicket(id: string): Promise<{ error?: string }> {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") return { error: "Only admins can delete equipment tickets." };

  const costs = await db.select().from(equipmentTicketCosts).where(eq(equipmentTicketCosts.ticketId, id));
  for (const c of costs) if (c.storageKey) await deleteObject(c.storageKey);
  await db.delete(equipmentTicketCosts).where(eq(equipmentTicketCosts.ticketId, id));
  await db.delete(equipmentTicketUpdates).where(eq(equipmentTicketUpdates.ticketId, id));
  await db.delete(equipmentTickets).where(eq(equipmentTickets.id, id));

  revalidatePath("/equipment");
  revalidatePath("/equipment/history");
  return {};
}

// Server-enforced: only admins and mechanics can change a ticket. Every save
// is logged with who did it, and resolving requires saying what was done.
export async function updateEquipmentTicket(id: string, status: string, note: string): Promise<{ error?: string }> {
  const current = await getSessionAndProfile();
  if (!current || !canSeeEquipment(current.profile)) return { error: "Only mechanics and admins can update equipment tickets." };
  if (!STATUSES.includes(status)) return { error: "Unknown status." };

  const existing = await db.query.equipmentTickets.findFirst({ where: eq(equipmentTickets.id, id) });
  if (!existing) return { error: "Ticket not found." };

  const cleanNote = note.trim();
  if (status === "resolved" && !cleanNote && !existing.resolution) {
    return { error: "Describe what was done to fix it before marking this resolved." };
  }
  if (!cleanNote && status === existing.status) return { error: "Add a note or change the status." };

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
  return {};
}
