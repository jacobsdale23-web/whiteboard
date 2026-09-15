"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { bidItems, estimateDetails, opportunities } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { computeEstimateSummary } from "@/lib/estimate";
import * as XLSX from "xlsx";

// Bid pricing, margins, and overhead/profit percentages are as sensitive as
// Budget data — never trust a client-side claim of admin here.
async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage estimates.");
  }
}

export type BidItemInput = {
  itemNo: string;
  category: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  notes: string;
};

export async function saveBidItem(opportunityId: string, id: string | null, data: BidItemInput) {
  await requireAdmin();
  const values = {
    opportunityId,
    itemNo: data.itemNo.trim() || "—",
    category: data.category,
    description: data.description.trim() || null,
    qty: data.qty as never,
    unit: data.unit.trim() || null,
    unitPrice: data.unitPrice as never,
    notes: data.notes.trim() || null,
  };
  if (id) {
    await db.update(bidItems).set(values).where(eq(bidItems.id, id));
  } else {
    const existing = await db.select({ order: bidItems.order }).from(bidItems).where(eq(bidItems.opportunityId, opportunityId));
    await db.insert(bidItems).values({ id: randomUUID(), order: String(existing.length), ...values });
  }
  revalidatePath(`/opportunities/${opportunityId}`);
}

export async function deleteBidItem(opportunityId: string, id: string) {
  await requireAdmin();
  await db.delete(bidItems).where(and(eq(bidItems.id, id), eq(bidItems.opportunityId, opportunityId)));
  revalidatePath(`/opportunities/${opportunityId}`);
}

export type EstimateDetailsInput = {
  bidNumber: string;
  bidValidUntil: string;
  jobType: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  overheadPercent: number;
  profitPercent: number;
  contingencyPercent: number;
  salesTaxPercent: number;
  bondInsuranceCost: number;
  scopeInclusions: string;
  scopeExclusions: string;
  paymentTerms: string;
  scheduleDuration: string;
  warranty: string;
  additionalNotes: string;
};

export async function saveEstimateDetails(opportunityId: string, data: EstimateDetailsInput) {
  await requireAdmin();
  const values = {
    bidNumber: data.bidNumber.trim() || null,
    bidValidUntil: data.bidValidUntil || null,
    jobType: data.jobType.trim() || null,
    contactName: data.contactName.trim() || null,
    contactPhone: data.contactPhone.trim() || null,
    contactEmail: data.contactEmail.trim() || null,
    overheadPercent: data.overheadPercent as never,
    profitPercent: data.profitPercent as never,
    contingencyPercent: data.contingencyPercent as never,
    salesTaxPercent: data.salesTaxPercent as never,
    bondInsuranceCost: data.bondInsuranceCost as never,
    scopeInclusions: data.scopeInclusions.trim() || null,
    scopeExclusions: data.scopeExclusions.trim() || null,
    paymentTerms: data.paymentTerms.trim() || null,
    scheduleDuration: data.scheduleDuration.trim() || null,
    warranty: data.warranty.trim() || null,
    additionalNotes: data.additionalNotes.trim() || null,
    updatedAt: new Date(),
  };
  await db
    .insert(estimateDetails)
    .values({ opportunityId, ...values })
    .onConflictDoUpdate({ target: estimateDetails.opportunityId, set: values });
  revalidatePath(`/opportunities/${opportunityId}`);
}

export async function exportEstimateExcel(opportunityId: string): Promise<{ filename: string; base64: string }> {
  await requireAdmin();
  const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId));
  if (!opportunity) throw new Error("Opportunity not found.");
  const [details] = await db.select().from(estimateDetails).where(eq(estimateDetails.opportunityId, opportunityId));
  const items = await db.select().from(bidItems).where(eq(bidItems.opportunityId, opportunityId));
  const sortedItems = items.slice().sort((a, b) => Number(a.order) - Number(b.order));

  const summary = computeEstimateSummary(
    sortedItems.map((i) => ({ qty: i.qty, unitPrice: i.unitPrice })),
    {
      overheadPercent: details?.overheadPercent ?? 0,
      profitPercent: details?.profitPercent ?? 0,
      contingencyPercent: details?.contingencyPercent ?? 0,
      salesTaxPercent: details?.salesTaxPercent ?? 0,
      bondInsuranceCost: details?.bondInsuranceCost ?? 0,
    }
  );

  const wb = XLSX.utils.book_new();

  const coverRows = [
    ["Project Name:", opportunity.jobName],
    ["Project Address:", opportunity.location || ""],
    ["Bid Number:", details?.bidNumber || ""],
    ["Bid Date:", new Date().toISOString().slice(0, 10)],
    ["Bid Valid Until:", details?.bidValidUntil || ""],
    [],
    ["Submitted To (Owner/GC):", opportunity.customer || ""],
    ["Contact Name:", details?.contactName || ""],
    ["Contact Phone:", details?.contactPhone || ""],
    ["Contact Email:", details?.contactEmail || ""],
    [],
    ["Contractor Company:", "Feliciana Welders, Inc."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(coverRows), "Cover Sheet");

  const itemRows = [
    ["Item #", "Category", "Description of Work", "Qty", "Unit", "Unit Price", "Total", "Notes"],
    ...sortedItems.map((i) => [
      i.itemNo,
      i.category,
      i.description || "",
      Number(i.qty),
      i.unit || "",
      Number(i.unitPrice),
      Number(i.qty) * Number(i.unitPrice),
      i.notes || "",
    ]),
    ["", "", "", "", "", "SUBTOTAL:", summary.directCost, ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(itemRows), "Bid Items");

  const summaryRows = [
    ["Direct Cost Subtotal", summary.directCost],
    ["Overhead (%)", details?.overheadPercent ?? 0],
    ["Profit / Margin (%)", details?.profitPercent ?? 0],
    ["Contingency (%)", details?.contingencyPercent ?? 0],
    ["Sales Tax (%)", details?.salesTaxPercent ?? 0],
    ["Bond / Insurance Cost ($)", summary.bondInsuranceCost],
    [],
    ["Overhead Amount", summary.overheadAmount],
    ["Profit Amount", summary.profitAmount],
    ["Contingency Amount", summary.contingencyAmount],
    [],
    ["Cost Before Tax", summary.costBeforeTax],
    ["Sales Tax Amount", summary.salesTaxAmount],
    [],
    ["TOTAL BID PRICE", summary.totalBidPrice],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Bid Summary");

  const termsRows = [
    ["Scope Inclusions:"],
    [details?.scopeInclusions || ""],
    [],
    ["Scope Exclusions:"],
    [details?.scopeExclusions || ""],
    [],
    ["Payment Terms:"],
    [details?.paymentTerms || ""],
    [],
    ["Schedule / Estimated Duration:"],
    [details?.scheduleDuration || ""],
    [],
    ["Warranty:"],
    [details?.warranty || ""],
    [],
    ["Additional Notes:"],
    [details?.additionalNotes || ""],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(termsRows), "Terms & Signature");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const filename = `Bid-${(details?.bidNumber || opportunity.jobName).replace(/[^a-z0-9]+/gi, "_")}.xlsx`;
  return { filename, base64: buf.toString("base64") };
}
