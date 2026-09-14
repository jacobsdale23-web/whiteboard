"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, invoices } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";

// Real, server-enforced admin check — this runs regardless of what any
// client-side UI shows, unlike a client-only role check.
async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage budget data.");
  }
}

export async function addExpense(projectId: string, formData: FormData) {
  await requireAdmin();
  const date = String(formData.get("date") || "") || null;
  const description = String(formData.get("description") || "").trim();
  const amount = Number(formData.get("amount")) || 0;
  await db.insert(expenses).values({ id: randomUUID(), projectId, date, description, amount: amount as never });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteExpense(projectId: string, id: string) {
  await requireAdmin();
  await db.delete(expenses).where(eq(expenses.id, id));
  revalidatePath(`/projects/${projectId}`);
}

export async function addInvoice(projectId: string, formData: FormData) {
  await requireAdmin();
  const invoiceNumber = String(formData.get("invoiceNumber") || "").trim() || null;
  const vendor = String(formData.get("vendor") || "").trim();
  const date = String(formData.get("date") || "") || null;
  const amount = Number(formData.get("amount")) || 0;
  const category = String(formData.get("category") || "Other");
  await db.insert(invoices).values({ id: randomUUID(), projectId, invoiceNumber, vendor, date, amount: amount as never, category });
  revalidatePath(`/projects/${projectId}`);
}

export async function deleteInvoice(projectId: string, id: string) {
  await requireAdmin();
  await db.delete(invoices).where(eq(invoices.id, id));
  revalidatePath(`/projects/${projectId}`);
}
