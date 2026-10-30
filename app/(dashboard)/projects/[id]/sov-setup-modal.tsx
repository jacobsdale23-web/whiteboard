"use client";

import { useState } from "react";
import { saveSovItems } from "./payapp-actions";

type ExistingItem = { itemNo: string; description: string | null; unit?: string | null; bidQty: string | number; unitPrice: string | number };
type Row = { itemNo: string; description: string; unit: string; bidQty: string; unitPrice: string; saved: boolean };

const num = (s: string) => {
  const n = Number(String(s ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Admin: the job's line items (schedule of values) with unit of measure, bid quantity and price. Foremen pick from
// these (without prices) to log what they installed each day. Items already saved can be edited but not removed,
// because pay applications refer to them.
export default function SovSetupModal({ projectId, existingItems, onClose }: { projectId: string; existingItems: ExistingItem[]; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>(
    existingItems.map((it) => ({ itemNo: it.itemNo, description: it.description || "", unit: it.unit || "", bidQty: String(Number(it.bidQty) || 0), unitPrice: String(Number(it.unitPrice) || 0), saved: true }))
  );
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function patch(i: number, p: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }

  // One line per item, columns separated by tabs (as copied from Excel): Item, Description, Unit, Bid Qty, Unit Price.
  function addPasted() {
    const lines = paste.split(/\r?\n/).map((l) => l.split("\t").map((c) => c.trim())).filter((c) => c[0]);
    if (!lines.length) return setMsg("Nothing to add. Paste rows copied from Excel, one line item per line.");
    let added = 0;
    let updated = 0;
    setRows((rs) => {
      const next = rs.slice();
      for (const [itemNo, description = "", unit = "", bidQty = "", unitPrice = ""] of lines) {
        if (/^(item|ref|bid item)/i.test(itemNo)) continue; // a header line
        const at = next.findIndex((r) => r.itemNo === itemNo);
        if (at >= 0) {
          next[at] = { ...next[at], description: description || next[at].description, unit: unit || next[at].unit, bidQty: bidQty ? String(num(bidQty)) : next[at].bidQty, unitPrice: unitPrice ? String(num(unitPrice)) : next[at].unitPrice };
          updated++;
        } else {
          next.push({ itemNo, description, unit, bidQty: String(num(bidQty)), unitPrice: String(num(unitPrice)), saved: false });
          added++;
        }
      }
      return next;
    });
    setPaste("");
    setMsg(`Added ${added}${updated ? `, updated ${updated}` : ""}. Review below, then save.`);
  }

  async function save() {
    setError("");
    setSaving(true);
    try {
      const res = await saveSovItems(
        projectId,
        rows.map((r) => ({ itemNo: r.itemNo, description: r.description, unit: r.unit, bidQty: num(r.bidQty), unitPrice: num(r.unitPrice), periodQty: 0, stored: 0, baselineQty: 0 }))
      );
      if (res.error) {
        setError(res.error);
        setSaving(false);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the line items.");
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <h2 style={{ marginBottom: 6, textTransform: "uppercase" }}>Line Items</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.84rem", marginBottom: 16 }}>
          The job&apos;s bid items. Foremen pick from this list (without prices) to log how much they installed each day, and the unit of measure shows next to each.
        </p>

        <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, background: "var(--surface-2)" }}>
          <label style={labelStyle}>Paste from Excel (optional)</label>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={3}
            placeholder={"Columns, in order: Item, Description, Unit, Bid Qty, Unit Price\n4\tEXPLORATORY EXCAVATION\tEach\t40\t350"}
            style={{ ...inputStyle, width: "100%", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
            <button type="button" onClick={addPasted} disabled={!paste.trim()} style={addBtnStyle}>
              Add pasted rows
            </button>
            {msg && <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{msg}</span>}
          </div>
        </div>

        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                {["Item", "Description", "Unit", "Bid Qty", "Unit Price", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", fontSize: "0.68rem", textTransform: "uppercase", color: "var(--muted)", padding: "6px 6px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: "3px 4px" }}>
                    <input value={r.itemNo} onChange={(e) => patch(i, { itemNo: e.target.value })} disabled={r.saved} style={{ ...cellInputStyle, width: 56, opacity: r.saved ? 0.7 : 1 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    <input value={r.description} onChange={(e) => patch(i, { description: e.target.value })} style={{ ...cellInputStyle, width: 260 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    <input value={r.unit} onChange={(e) => patch(i, { unit: e.target.value })} placeholder="Each" style={{ ...cellInputStyle, width: 90 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    <input type="number" value={r.bidQty} onChange={(e) => patch(i, { bidQty: e.target.value })} style={{ ...cellInputStyle, width: 80 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    <input type="number" value={r.unitPrice} onChange={(e) => patch(i, { unitPrice: e.target.value })} style={{ ...cellInputStyle, width: 90 }} />
                  </td>
                  <td style={{ padding: "3px 4px" }}>
                    {!r.saved && (
                      <button type="button" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))} style={deleteBtnStyle}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setRows((rs) => [...rs, { itemNo: "", description: "", unit: "", bidQty: "0", unitPrice: "0", saved: false }])} style={{ ...addBtnStyle, marginBottom: 16 }}>
          + Add Line Item
        </button>

        {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 8 }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={saving} style={primaryBtnStyle}>
            {saving ? "Saving…" : "Save Line Items"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(20,18,15,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto", zIndex: 50 };
const modalStyle: React.CSSProperties = { background: "var(--surface)", borderRadius: 12, width: "100%", maxWidth: 900, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", border: "1px solid var(--border)" };
const labelStyle: React.CSSProperties = { fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600, display: "block", marginBottom: 4 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 10px", fontSize: "0.92rem", color: "var(--ink)" };
const cellInputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 5, padding: "6px 7px", fontSize: "0.82rem", color: "var(--ink)", fontFamily: "inherit" };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 24, height: 24, cursor: "pointer", color: "var(--muted)" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
