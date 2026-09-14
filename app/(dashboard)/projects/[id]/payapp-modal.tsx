"use client";

import { useState } from "react";
import { parsePayAppFile, savePayApp } from "./payapp-actions";

type ExistingItem = { itemNo: string; description: string | null; bidQty: string | number; unitPrice: string | number; baselineQty: string | number };
type RowState = { itemNo: string; description: string; bidQty: number; unitPrice: number; periodQty: number; stored: number; baselineQty: number };

const emptyRow = (): RowState => ({ itemNo: "", description: "", bidQty: 0, unitPrice: 0, periodQty: 0, stored: 0, baselineQty: 0 });

export default function PayAppModal({
  projectId,
  existingItems,
  onClose,
}: {
  projectId: string;
  existingItems: ExistingItem[];
  onClose: () => void;
}) {
  const [appNumber, setAppNumber] = useState("");
  const [period, setPeriod] = useState("");
  const [applicationDate, setApplicationDate] = useState("");
  const [retainagePercent, setRetainagePercent] = useState(5);
  const [rows, setRows] = useState<RowState[]>(
    existingItems.length
      ? existingItems.map((it) => ({
          itemNo: it.itemNo,
          description: it.description || "",
          bidQty: Number(it.bidQty),
          unitPrice: Number(it.unitPrice),
          periodQty: 0,
          stored: 0,
          baselineQty: Number(it.baselineQty),
        }))
      : [emptyRow()]
  );
  const [importMsg, setImportMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg(`Reading ${file.name}…`);
    const result = await parsePayAppFile(file);
    if ("error" in result) {
      setImportMsg(result.error);
      return;
    }
    if (result.appNumber) setAppNumber(result.appNumber);
    if (result.period) setPeriod(result.period);
    if (result.applicationDate) setApplicationDate(result.applicationDate);
    if (result.retainagePercent !== null) setRetainagePercent(result.retainagePercent);
    if (result.rows.length) {
      setRows(result.rows);
      setImportMsg(`Imported ${result.rows.length} line items from "${result.sheetName || ""}".`);
    } else {
      setImportMsg("Filled in the header fields, but couldn't find a line-item schedule sheet — check the rows below.");
    }
  }

  function updateRow(i: number, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      await savePayApp(projectId, { appNumber, period, applicationDate: applicationDate || null, retainagePercent }, rows);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that pay application.");
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <h2 style={{ marginBottom: 16, textTransform: "uppercase" }}>Add Pay Application</h2>

        <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, background: "var(--surface-2)" }}>
          <label style={labelStyle}>Import from spreadsheet (optional)</label>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} />
          {importMsg && <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 6 }}>{importMsg}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
          <Field label="Application #">
            <input type="text" value={appNumber} onChange={(e) => setAppNumber(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Retainage %">
            <input type="number" value={retainagePercent} onChange={(e) => setRetainagePercent(Number(e.target.value))} style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <Field label="Period">
            <input type="text" placeholder="e.g. 8/1/26 - 8/31/26" value={period} onChange={(e) => setPeriod(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Application Date">
            <input type="date" value={applicationDate} onChange={(e) => setApplicationDate(e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <label style={labelStyle}>Schedule of Values</label>
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                {["Item", "Description", "Bid Qty", "Unit Price", "This Period Qty", "Stored $", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", fontSize: "0.68rem", textTransform: "uppercase", color: "var(--muted)", padding: "0 6px 6px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: "3px 4px" }}>
                    <input value={row.itemNo} onChange={(e) => updateRow(i, { itemNo: e.target.value })} style={{ ...cellInputStyle, width: 56 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    <input value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} style={{ ...cellInputStyle, width: 180 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    <input type="number" value={row.bidQty} onChange={(e) => updateRow(i, { bidQty: Number(e.target.value) })} style={{ ...cellInputStyle, width: 75 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    <input type="number" value={row.unitPrice} onChange={(e) => updateRow(i, { unitPrice: Number(e.target.value) })} style={{ ...cellInputStyle, width: 85 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    <input type="number" value={row.periodQty} onChange={(e) => updateRow(i, { periodQty: Number(e.target.value) })} style={{ ...cellInputStyle, width: 85 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    <input type="number" value={row.stored} onChange={(e) => updateRow(i, { stored: Number(e.target.value) })} style={{ ...cellInputStyle, width: 85 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    <button type="button" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} style={deleteBtnStyle}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} style={{ ...addBtnStyle, marginBottom: 16 }}>
          + Add Line Item
        </button>

        {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 8 }}>{error}</p>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} style={primaryBtnStyle}>
            {saving ? "Saving…" : "Save Pay Application"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(20,18,15,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto", zIndex: 50 };
const modalStyle: React.CSSProperties = { background: "var(--surface)", borderRadius: 12, width: "100%", maxWidth: 900, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", border: "1px solid var(--border)" };
const labelStyle: React.CSSProperties = { fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, display: "block", marginBottom: 4 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 10px", fontSize: "0.92rem", color: "var(--ink)", fontFamily: "inherit", width: "100%" };
const cellInputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 5, padding: "6px 7px", fontSize: "0.82rem", color: "var(--ink)", fontFamily: "inherit" };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 24, height: 24, cursor: "pointer", color: "var(--muted)" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
