"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, projectFiles, projectQuotes } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireProject } from "@/lib/auth/company";
import { getObjectBuffer } from "@/lib/storage/s3";
import { scanQuotePdf } from "@/lib/quote-scan";
import { cleanQbLink, cleanQuoteFields, cleanQuoteLines } from "@/lib/quotes";

// Quotes carry prices: admin-only, like the Budget they sit beside.
async function requireQuoteAdmin(projectId: string) {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") throw new Error("Only admins can manage quotes.");
  const project = await requireProject(projectId);
  return { project, name: current.profile.name };
}

export type QuoteInput = {
  number: string;
  quoteDate: string;
  customer: string;
  total: string | number;
  expires: string;
  qbLink: string;
  lines: { description: string; qty: string | number; amount: string | number }[];
  fileId: string | null;
};

export type ScanResult = { error?: string; number?: string; quoteDate?: string; expires?: string; customer?: string; total?: number; lines?: { description: string; qty: number; amount: number }[] };

// Reads the quote PDF that was just uploaded to the project's documents and fills in the form. Always review it.
export async function scanQuoteFile(projectId: string, fileId: string): Promise<ScanResult> {
  await requireQuoteAdmin(projectId);
  const [file] = await db.select().from(projectFiles).where(and(eq(projectFiles.id, fileId), eq(projectFiles.projectId, projectId)));
  if (!file) return { error: "That file isn't on this job." };
  if (!/\.pdf$/i.test(file.filename)) return { error: "Only a PDF can be read automatically. Type the quote details in below." };
  try {
    const scanned = await scanQuotePdf(await getObjectBuffer(file.storageKey));
    return {
      number: scanned.number ?? undefined,
      quoteDate: scanned.date ?? undefined,
      expires: scanned.expires ?? undefined,
      customer: scanned.customer ?? undefined,
      total: scanned.total ?? undefined,
      lines: scanned.lines,
    };
  } catch {
    return { error: "Couldn't read that quote automatically. Type the details in below." };
  }
}

export async function saveQuote(projectId: string, input: QuoteInput, quoteId?: string): Promise<{ error?: string }> {
  const { project } = await requireQuoteAdmin(projectId);
  const fields = cleanQuoteFields({ number: input.number, quoteDate: input.quoteDate, total: input.total, expires: input.expires });
  if ("error" in fields) return { error: fields.error };
  const link = cleanQbLink(input.qbLink || "");
  if ("error" in link) return { error: link.error };
  const lines = cleanQuoteLines(input.lines);
  if ("error" in lines) return { error: lines.error };

  if (input.fileId) {
    const [file] = await db.select({ id: projectFiles.id }).from(projectFiles).where(and(eq(projectFiles.id, input.fileId), eq(projectFiles.projectId, projectId)));
    if (!file) return { error: "That quote file isn't on this job." };
  }

  const values = {
    number: fields.number,
    quoteDate: fields.quoteDate,
    customer: input.customer.trim() || project.customer || null,
    total: fields.total as never,
    expires: fields.expires,
    qbLink: link.link,
    lines: lines.lines,
    fileId: input.fileId || null,
  };
  if (quoteId) {
    const [existing] = await db.select({ id: projectQuotes.id }).from(projectQuotes).where(and(eq(projectQuotes.id, quoteId), eq(projectQuotes.projectId, projectId)));
    if (!existing) return { error: "That quote no longer exists." };
    await db.update(projectQuotes).set(values).where(eq(projectQuotes.id, quoteId));
  } else {
    await db.insert(projectQuotes).values({ id: randomUUID(), projectId, ...values });
  }
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// Removes the quote record. The PDF stays in the job's documents.
export async function deleteQuote(projectId: string, quoteId: string): Promise<{ error?: string }> {
  await requireQuoteAdmin(projectId);
  await db.delete(projectQuotes).where(and(eq(projectQuotes.id, quoteId), eq(projectQuotes.projectId, projectId)));
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// After the invoice is made in QuickBooks: remember which invoice it was, and (optionally) mark the job Billed once
// every quote on it has been billed.
export async function recordQuoteBilled(
  projectId: string,
  quoteId: string,
  input: { invoiceNo: string; date: string; amount: string | number; markJobBilled: boolean }
): Promise<{ error?: string }> {
  const { project, name } = await requireQuoteAdmin(projectId);
  const invoiceNo = input.invoiceNo.trim();
  const amount = Number(String(input.amount).replace(/[$,\s]/g, ""));
  if (!invoiceNo) return { error: "Enter the QuickBooks invoice number." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) return { error: "Enter the invoice date." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the invoice amount." };

  const [quote] = await db.select({ id: projectQuotes.id }).from(projectQuotes).where(and(eq(projectQuotes.id, quoteId), eq(projectQuotes.projectId, projectId)));
  if (!quote) return { error: "That quote no longer exists." };
  await db
    .update(projectQuotes)
    .set({ billedInvoiceNo: invoiceNo, billedDate: input.date, billedAmount: (Math.round(amount * 100) / 100) as never, billedBy: name })
    .where(eq(projectQuotes.id, quoteId));

  if (input.markJobBilled) {
    const all = await db.select({ billedInvoiceNo: projectQuotes.billedInvoiceNo }).from(projectQuotes).where(eq(projectQuotes.projectId, projectId));
    if (all.every((q) => q.billedInvoiceNo) && project.status !== "billed" && project.status !== "canceled") {
      await db.update(projects).set({ status: "billed" }).where(eq(projects.id, projectId));
    }
  }
  revalidatePath(`/projects/${projectId}`);
  return {};
}

// For a wrong invoice number or a voided invoice.
export async function clearQuoteBilled(projectId: string, quoteId: string): Promise<{ error?: string }> {
  const { project } = await requireQuoteAdmin(projectId);
  await db
    .update(projectQuotes)
    .set({ billedInvoiceNo: null, billedDate: null, billedAmount: null, billedBy: null })
    .where(and(eq(projectQuotes.id, quoteId), eq(projectQuotes.projectId, projectId)));
  if (project.status === "billed") await db.update(projects).set({ status: "complete" }).where(eq(projects.id, projectId));
  revalidatePath(`/projects/${projectId}`);
  return {};
}
