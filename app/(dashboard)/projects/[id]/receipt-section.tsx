"use client";

import { useRef, useState } from "react";
import { requestReceiptUpload, scanReceipt, saveReceipt, discardReceiptUpload } from "./receipt-actions";
import { TM_RECEIPT_CATEGORIES } from "@/lib/receipt-categories";

type LineItem = { itemNo: string; description: string | null };

type Draft = {
  storageKey: string;
  previewUrl: string;
  vendor: string;
  amount: string;
  date: string;
  category: string;
  lineItem: string;
  note: string;
  aiVendor: string | null;
  aiAmount: number | null;
  scanFailed: boolean;
};

// Phone photos are 3-10 MB; shrink to a readable ~1800px JPEG before uploading.
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (blob) return blob;
  } catch {
    // fall through to the original file
  }
  return file;
}

export default function ReceiptSection({
  projectId,
  billingType,
  lineItems,
}: {
  projectId: string;
  billingType: string;
  lineItems: LineItem[];
}) {
  const isTm = billingType === "tm";
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setDone(false);
    try {
      setBusy("Preparing photo…");
      const blob = await shrinkPhoto(file);
      const contentType = blob.type === "image/png" || blob.type === "image/webp" ? blob.type : "image/jpeg";

      setBusy("Uploading…");
      const req = await requestReceiptUpload(projectId, contentType);
      if (req.error || !req.uploadUrl || !req.storageKey) return setError(req.error || "Couldn't start the upload.");
      const put = await fetch(req.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
      if (!put.ok) return setError("The upload didn't go through. Check your signal and try again.");

      setBusy("Reading the receipt…");
      const scan = await scanReceipt(projectId, req.storageKey);
      setDraft({
        storageKey: req.storageKey,
        previewUrl: URL.createObjectURL(blob),
        vendor: scan.vendor || "",
        amount: scan.total ? String(scan.total) : "",
        date: scan.date || new Date().toISOString().slice(0, 10),
        category: "",
        lineItem: "",
        note: "",
        aiVendor: scan.vendor || null,
        aiAmount: scan.total ?? null,
        scanFailed: !!scan.error || (!scan.vendor && !scan.total),
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy("");
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

  async function submit() {
    if (!draft) return;
    setError("");
    const amount = Number(draft.amount);
    if (!(amount > 0)) return setError("Enter the receipt total.");
    if (isTm && !draft.category) return setError("Pick a category: Fuel, Food, Materials, or Equipment.");

    setBusy("Saving…");
    try {
      const res = await saveReceipt(projectId, {
        storageKey: draft.storageKey,
        vendor: draft.vendor,
        amount,
        date: draft.date,
        category: draft.category,
        lineItem: draft.lineItem,
        note: draft.note,
        aiVendor: draft.aiVendor,
        aiAmount: draft.aiAmount,
      });
      if (res.error) return setError(res.error);
      URL.revokeObjectURL(draft.previewUrl);
      setDraft(null);
      setDone(true);
    } catch {
      setError("Couldn't save the receipt. Please try again.");
    } finally {
      setBusy("");
    }
  }

  async function cancel() {
    if (!draft) return;
    URL.revokeObjectURL(draft.previewUrl);
    await discardReceiptUpload(projectId, draft.storageKey).catch(() => {});
    setDraft(null);
    setError("");
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Receipts</h3>
      <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "2px 0 12px" }}>
        Take a photo of a receipt for this job. We read the vendor and total for you.
      </p>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" aria-label="Take a photo of a receipt" style={invisibleInput} onChange={(e) => handleFile(e.target.files?.[0])} />
      <input ref={libraryRef} type="file" accept="image/*" aria-label="Choose a receipt photo" style={invisibleInput} onChange={(e) => handleFile(e.target.files?.[0])} />

      {!draft && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => cameraRef.current?.click()} disabled={!!busy} style={bigPrimaryBtn}>
            📷 Scan Receipt
          </button>
          <button onClick={() => libraryRef.current?.click()} disabled={!!busy} style={bigSecondaryBtn}>
            Choose a photo
          </button>
        </div>
      )}

      {busy && <p style={{ marginTop: 12, fontWeight: 600 }}>{busy}</p>}
      {done && <p style={{ marginTop: 12, color: "var(--active)", fontWeight: 600 }}>Receipt submitted. Thank you!</p>}
      {error && <p style={{ marginTop: 12, color: "var(--danger)", fontSize: "0.95rem" }}>{error}</p>}

      {draft && (
        <div style={{ marginTop: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.previewUrl}
            alt="Your receipt"
            style={{ width: "100%", maxHeight: 260, objectFit: "contain", background: "var(--surface-2)", borderRadius: 8, marginBottom: 12 }}
          />
          <p style={{ fontSize: "0.82rem", color: draft.scanFailed ? "var(--danger)" : "var(--muted)", marginBottom: 12 }}>
            {draft.scanFailed
              ? "We couldn't read this one automatically. Please fill in the details."
              : "We filled this in from your photo. Please double-check the total."}
          </p>

          <label style={labelStyle}>Vendor</label>
          <input value={draft.vendor} onChange={(e) => set({ vendor: e.target.value })} style={inputStyle} placeholder="Store or business name" />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={labelStyle}>Total ($)</label>
              <input value={draft.amount} onChange={(e) => set({ amount: e.target.value })} style={inputStyle} inputMode="decimal" placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} style={inputStyle} />
            </div>
          </div>

          {isTm ? (
            <>
              <label style={labelStyle}>Category</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                {TM_RECEIPT_CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set({ category: c })}
                    style={{
                      ...bigSecondaryBtn,
                      ...(draft.category === c ? { background: "var(--rust)", color: "var(--rust-ink)", borderColor: "var(--rust)" } : {}),
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <label style={labelStyle}>Which line item is this for?</label>
              <select value={draft.lineItem} onChange={(e) => set({ lineItem: e.target.value })} style={inputStyle}>
                <option value="">— General / not sure —</option>
                {lineItems
                  .slice()
                  .sort((a, b) => a.itemNo.localeCompare(b.itemNo, undefined, { numeric: true }))
                  .map((li) => (
                    <option key={li.itemNo} value={li.itemNo}>
                      {li.itemNo} — {li.description}
                    </option>
                  ))}
              </select>
            </>
          )}

          <label style={labelStyle}>Note (optional)</label>
          <input value={draft.note} onChange={(e) => set({ note: e.target.value })} style={inputStyle} placeholder="What was it for?" />

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={submit} disabled={!!busy} style={bigPrimaryBtn}>
              Submit Receipt
            </button>
            <button onClick={cancel} disabled={!!busy} style={bigSecondaryBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const invisibleInput: React.CSSProperties = { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" };
const cardStyle: React.CSSProperties = { position: "relative", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
// 16px inputs stop iPhones from zooming the page when a field is tapped.
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 12px", fontSize: "1rem", color: "var(--ink)", fontFamily: "inherit", width: "100%", marginBottom: 14, minHeight: 48 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.74rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 };
const bigPrimaryBtn: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "1px solid var(--rust)", borderRadius: 10, padding: "14px 20px", fontWeight: 700, fontSize: "1rem", cursor: "pointer", minHeight: 52, flex: 1 };
const bigSecondaryBtn: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 20px", fontWeight: 700, fontSize: "1rem", cursor: "pointer", minHeight: 52 };
