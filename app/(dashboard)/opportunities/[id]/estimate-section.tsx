"use client";

import { useMemo, useState, useTransition } from "react";
import { saveBidItem, deleteBidItem, saveEstimateDetails, exportEstimateExcel, type BidItemInput, type EstimateDetailsInput } from "./estimate-actions";
import { BID_CATEGORIES, computeEstimateSummary } from "@/lib/estimate";

type BidItem = {
  id: string;
  itemNo: string;
  category: string;
  description: string | null;
  qty: string;
  unit: string | null;
  unitPrice: string;
  notes: string | null;
  order: string;
};
type EstimateDetails = {
  bidNumber: string | null;
  bidValidUntil: string | null;
  jobType: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  overheadPercent: string;
  profitPercent: string;
  contingencyPercent: string;
  salesTaxPercent: string;
  bondInsuranceCost: string;
  scopeInclusions: string | null;
  scopeExclusions: string | null;
  paymentTerms: string | null;
  scheduleDuration: string | null;
  warranty: string | null;
  additionalNotes: string | null;
} | null;

export default function EstimateSection({ opportunityId, items, details }: { opportunityId: string; items: BidItem[]; details: EstimateDetails }) {
  const [, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);
  const [markup, setMarkup] = useState({
    overheadPercent: details?.overheadPercent ?? "10",
    profitPercent: details?.profitPercent ?? "8",
    contingencyPercent: details?.contingencyPercent ?? "3",
    salesTaxPercent: details?.salesTaxPercent ?? "0",
    bondInsuranceCost: details?.bondInsuranceCost ?? "0",
  });

  const sorted = useMemo(() => items.slice().sort((a, b) => Number(a.order) - Number(b.order)), [items]);
  const summary = useMemo(() => computeEstimateSummary(sorted.map((i) => ({ qty: i.qty, unitPrice: i.unitPrice })), markup), [sorted, markup]);

  async function handleSaveDetails(formData: FormData) {
    const data: EstimateDetailsInput = {
      bidNumber: String(formData.get("bidNumber") || ""),
      bidValidUntil: String(formData.get("bidValidUntil") || ""),
      jobType: String(formData.get("jobType") || ""),
      contactName: String(formData.get("contactName") || ""),
      contactPhone: String(formData.get("contactPhone") || ""),
      contactEmail: String(formData.get("contactEmail") || ""),
      overheadPercent: Number(markup.overheadPercent) || 0,
      profitPercent: Number(markup.profitPercent) || 0,
      contingencyPercent: Number(markup.contingencyPercent) || 0,
      salesTaxPercent: Number(markup.salesTaxPercent) || 0,
      bondInsuranceCost: Number(markup.bondInsuranceCost) || 0,
      scopeInclusions: String(formData.get("scopeInclusions") || ""),
      scopeExclusions: String(formData.get("scopeExclusions") || ""),
      paymentTerms: String(formData.get("paymentTerms") || ""),
      scheduleDuration: String(formData.get("scheduleDuration") || ""),
      warranty: String(formData.get("warranty") || ""),
      additionalNotes: String(formData.get("additionalNotes") || ""),
    };
    await saveEstimateDetails(opportunityId, data);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { filename, base64 } = await exportEstimateExcel(opportunityId);
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Bid Items</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <BidItemModal opportunityId={opportunityId} nextItemNo={String(sorted.length + 1)} />
            <button onClick={handleExport} disabled={exporting} style={secondaryBtnStyle}>
              {exporting ? "Exporting…" : "Export to Excel"}
            </button>
          </div>
        </div>

        {sorted.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  {["#", "Category", "Description", "Qty", "Unit", "Unit Price", "Total", "Notes", ""].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const total = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
                  return (
                    <tr key={item.id}>
                      <td style={tdStyle}>{item.itemNo}</td>
                      <td style={{ ...tdStyle, fontFamily: "inherit" }}>{item.category}</td>
                      <td style={{ ...tdStyle, fontFamily: "inherit", whiteSpace: "normal", minWidth: 180 }}>{item.description}</td>
                      <td style={tdStyle}>{item.qty}</td>
                      <td style={tdStyle}>{item.unit}</td>
                      <td style={tdStyle}>${Number(item.unitPrice).toLocaleString()}</td>
                      <td style={tdStyle}>${total.toLocaleString()}</td>
                      <td style={{ ...tdStyle, fontFamily: "inherit", whiteSpace: "normal", minWidth: 140, color: "var(--muted)" }}>{item.notes}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <BidItemModal opportunityId={opportunityId} item={item} nextItemNo={item.itemNo} />
                          <button
                            onClick={() => {
                              if (confirm(`Delete item ${item.itemNo}?`)) startTransition(() => deleteBidItem(opportunityId, item.id));
                            }}
                            style={deleteBtnStyle}
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No bid items yet.</p>
        )}
      </div>

      <form action={handleSaveDetails} style={cardStyle}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 14 }}>Bid Summary</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
          <Stat label="Direct Cost Subtotal" value={fmt(summary.directCost)} />
          <Stat label="Overhead Amount" value={fmt(summary.overheadAmount)} />
          <Stat label="Profit Amount" value={fmt(summary.profitAmount)} />
          <Stat label="Contingency Amount" value={fmt(summary.contingencyAmount)} />
          <Stat label="Cost Before Tax" value={fmt(summary.costBeforeTax)} />
          <Stat label="Sales Tax Amount" value={fmt(summary.salesTaxAmount)} />
          <Stat label="Total Bid Price" value={fmt(summary.totalBidPrice)} highlight />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 12, marginBottom: 18 }}>
          <MarkupField label="Overhead %" value={markup.overheadPercent} onChange={(v) => setMarkup((m) => ({ ...m, overheadPercent: v }))} />
          <MarkupField label="Profit / Margin %" value={markup.profitPercent} onChange={(v) => setMarkup((m) => ({ ...m, profitPercent: v }))} />
          <MarkupField label="Contingency %" value={markup.contingencyPercent} onChange={(v) => setMarkup((m) => ({ ...m, contingencyPercent: v }))} />
          <MarkupField label="Sales Tax %" value={markup.salesTaxPercent} onChange={(v) => setMarkup((m) => ({ ...m, salesTaxPercent: v }))} />
          <MarkupField label="Bond/Insurance $" value={markup.bondInsuranceCost} onChange={(v) => setMarkup((m) => ({ ...m, bondInsuranceCost: v }))} />
        </div>

        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 14 }}>Cover &amp; Contact</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Bid Number">
            <input type="text" name="bidNumber" defaultValue={details?.bidNumber || ""} style={inputStyle} />
          </Field>
          <Field label="Bid Valid Until">
            <input type="date" name="bidValidUntil" defaultValue={details?.bidValidUntil || ""} style={inputStyle} />
          </Field>
        </div>
        <Field label="Job Type / Scope">
          <input type="text" name="jobType" placeholder="e.g. Distribution main, steel tie-in, directional bore" defaultValue={details?.jobType || ""} style={inputStyle} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Field label="Contact Name">
            <input type="text" name="contactName" defaultValue={details?.contactName || ""} style={inputStyle} />
          </Field>
          <Field label="Contact Phone">
            <input type="text" name="contactPhone" defaultValue={details?.contactPhone || ""} style={inputStyle} />
          </Field>
          <Field label="Contact Email">
            <input type="email" name="contactEmail" defaultValue={details?.contactEmail || ""} style={inputStyle} />
          </Field>
        </div>

        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", margin: "18px 0 14px" }}>Terms &amp; Notes</h3>
        <Field label="Scope Inclusions">
          <textarea name="scopeInclusions" rows={2} defaultValue={details?.scopeInclusions || ""} style={{ ...inputStyle, resize: "vertical" }} />
        </Field>
        <Field label="Scope Exclusions">
          <textarea name="scopeExclusions" rows={2} defaultValue={details?.scopeExclusions || ""} style={{ ...inputStyle, resize: "vertical" }} />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Payment Terms">
            <input type="text" name="paymentTerms" defaultValue={details?.paymentTerms || ""} style={inputStyle} />
          </Field>
          <Field label="Schedule / Estimated Duration">
            <input type="text" name="scheduleDuration" defaultValue={details?.scheduleDuration || ""} style={inputStyle} />
          </Field>
        </div>
        <Field label="Warranty">
          <input type="text" name="warranty" defaultValue={details?.warranty || ""} style={inputStyle} />
        </Field>
        <Field label="Additional Notes">
          <textarea name="additionalNotes" rows={2} defaultValue={details?.additionalNotes || ""} style={{ ...inputStyle, resize: "vertical" }} />
        </Field>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button type="submit" style={primaryBtnStyle}>
            Save Estimate Details
          </button>
        </div>
      </form>
    </div>
  );
}

function BidItemModal({ opportunityId, item, nextItemNo }: { opportunityId: string; item?: BidItem; nextItemNo: string }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isEdit = !!item;

  async function handleSubmit(formData: FormData) {
    setError("");
    setSaving(true);
    const data: BidItemInput = {
      itemNo: String(formData.get("itemNo") || ""),
      category: String(formData.get("category") || BID_CATEGORIES[0]),
      description: String(formData.get("description") || ""),
      qty: Number(formData.get("qty")) || 0,
      unit: String(formData.get("unit") || ""),
      unitPrice: Number(formData.get("unitPrice")) || 0,
      notes: String(formData.get("notes") || ""),
    };
    try {
      await saveBidItem(opportunityId, item?.id ?? null, data);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {isEdit ? (
        <button onClick={() => setOpen(true)} style={iconBtnStyle} title="Edit">
          ✎
        </button>
      ) : (
        <button onClick={() => setOpen(true)} style={secondaryBtnStyle}>
          + Add Item
        </button>
      )}

      {open && (
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <form
            action={handleSubmit}
            style={modalStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: 16, textTransform: "uppercase" }}>{isEdit ? "Edit Bid Item" : "Add Bid Item"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
              <Field label="Item #">
                <input type="text" name="itemNo" defaultValue={item?.itemNo || nextItemNo} style={inputStyle} />
              </Field>
              <Field label="Category">
                <select name="category" defaultValue={item?.category || BID_CATEGORIES[0]} style={inputStyle}>
                  {BID_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Description of Work">
              <textarea name="description" rows={2} defaultValue={item?.description || ""} style={{ ...inputStyle, resize: "vertical" }} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Field label="Qty">
                <input type="number" name="qty" min="0" step="0.01" defaultValue={item?.qty || ""} style={inputStyle} />
              </Field>
              <Field label="Unit">
                <input type="text" name="unit" placeholder="LF, EA, HR…" defaultValue={item?.unit || ""} style={inputStyle} />
              </Field>
              <Field label="Unit Price ($)">
                <input type="number" name="unitPrice" min="0" step="0.01" defaultValue={item?.unitPrice || ""} style={inputStyle} />
              </Field>
            </div>
            <Field label="Notes">
              <input type="text" name="notes" defaultValue={item?.notes || ""} style={inputStyle} />
            </Field>

            {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</p>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => setOpen(false)} style={secondaryBtnStyle}>
                Cancel
              </button>
              <button type="submit" disabled={saving} style={primaryBtnStyle}>
                {saving ? "Saving…" : "Save Item"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function MarkupField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>
      {label}
      <input type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ background: highlight ? "var(--rust)" : "var(--surface-2)", color: highlight ? "var(--rust-ink)" : "inherit", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontSize: "0.64rem", textTransform: "uppercase", opacity: 0.8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1rem", marginTop: 3 }}>{value}</div>
    </div>
  );
}

function fmt(v: number): string {
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit", width: "100%" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
const iconBtnStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: "0.66rem", textTransform: "uppercase", color: "var(--muted)", padding: "6px 9px", background: "var(--surface-2)", whiteSpace: "nowrap" };
const tdStyle: React.CSSProperties = { padding: "6px 9px", fontFamily: "var(--font-mono)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(20,18,15,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto", zIndex: 50 };
const modalStyle: React.CSSProperties = { background: "var(--surface)", borderRadius: 12, width: "100%", maxWidth: 480, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", border: "1px solid var(--border)" };
