"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipmentTickets, equipmentTicketCosts, equipmentTicketUpdates } from "@/lib/db/schema";
import { getSessionAndProfile, canSeeEquipment } from "@/lib/auth/current-user";
import { deleteObject, getDownloadUrl, getUploadUrl } from "@/lib/storage/s3";

const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

async function requireMechanicOrAdmin() {
  const current = await getSessionAndProfile();
  if (!current || !canSeeEquipment(current.profile)) return null;
  return current;
}

// The file goes browser -> storage on a presigned URL (phone photos and scans
// can be big); this just hands out that URL.
export async function requestInvoiceUpload(
  ticketId: string,
  filename: string
): Promise<{ error?: string; uploadUrl?: string; storageKey?: string; contentType?: string }> {
  if (!(await requireMechanicOrAdmin())) return { error: "Only mechanics and admins can add parts invoices." };
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const contentType = ALLOWED_TYPES[ext];
  if (!contentType) return { error: "Invoices can be a PDF or a photo (JPG, PNG, HEIC)." };

  const storageKey = `equipment/${ticketId}/${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return { uploadUrl: await getUploadUrl(storageKey, contentType), storageKey, contentType };
}

export async function addTicketCost(
  ticketId: string,
  data: { vendor: string; description: string; amount: number; storageKey?: string; filename?: string; contentType?: string }
): Promise<{ error?: string }> {
  const current = await requireMechanicOrAdmin();
  if (!current) return { error: "Only mechanics and admins can add parts invoices." };

  const ticket = await db.query.equipmentTickets.findFirst({ where: eq(equipmentTickets.id, ticketId) });
  if (!ticket) return { error: "Ticket not found." };
  if (!Number.isFinite(data.amount) || data.amount <= 0) return { error: "Enter the invoice amount." };
  if (data.storageKey && !data.storageKey.startsWith(`equipment/${ticketId}/`)) return { error: "Invalid file." };

  const vendor = data.vendor.trim() || null;
  await db.insert(equipmentTicketCosts).values({
    id: randomUUID(),
    ticketId,
    vendor,
    description: data.description.trim() || null,
    amount: data.amount.toFixed(2) as never,
    storageKey: data.storageKey || null,
    filename: data.filename || null,
    contentType: data.contentType || null,
    uploadedBy: current.profile.name,
    uploadedById: current.profile.id,
  });
  await db.insert(equipmentTicketUpdates).values({
    id: randomUUID(),
    ticketId,
    author: current.profile.name,
    status: ticket.status,
    note: `Added parts invoice: $${data.amount.toFixed(2)}${vendor ? ` from ${vendor}` : ""}.`,
  });

  revalidatePath("/equipment");
  revalidatePath("/equipment/history");
  return {};
}

export async function getInvoiceUrl(costId: string): Promise<{ error?: string; url?: string }> {
  if (!(await requireMechanicOrAdmin())) return { error: "Not allowed." };
  const cost = await db.query.equipmentTicketCosts.findFirst({ where: eq(equipmentTicketCosts.id, costId) });
  if (!cost?.storageKey) return { error: "No file attached." };
  return { url: await getDownloadUrl(cost.storageKey) };
}

// Admins can delete any cost line; the person who added a line can delete their own.
export async function deleteTicketCost(costId: string): Promise<{ error?: string }> {
  const current = await requireMechanicOrAdmin();
  if (!current) return { error: "Not allowed." };
  const cost = await db.query.equipmentTicketCosts.findFirst({ where: eq(equipmentTicketCosts.id, costId) });
  if (!cost) return { error: "Not found." };
  if (current.profile.role !== "admin" && cost.uploadedById !== current.profile.id) {
    return { error: "You can only remove invoices you added." };
  }
  if (cost.storageKey) await deleteObject(cost.storageKey);
  await db.delete(equipmentTicketCosts).where(eq(equipmentTicketCosts.id, costId));
  revalidatePath("/equipment");
  revalidatePath("/equipment/history");
  return {};
}
