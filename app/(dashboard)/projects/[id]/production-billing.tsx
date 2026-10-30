"use client";

import { useEffect, useState } from "react";
import { getProductionDraft, type ProductionDraft } from "./payapp-actions";
import type { PayAppDraft } from "./payapp-modal";
import { fmtQty } from "@/lib/production";

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
};

// Pick the dates, see what the foremen logged per line item across them, and carry it into a pay application.
export default function GenerateFromLogs({
  projectId,
  defaultFrom,
  defaultTo,
  onClose,
  onContinue,
}: {
  projectId: string;
  defaultFrom: string;
  defaultTo: string;
  onClose: () => void;
  onContinue: (draft: PayAppDraft) => void;
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [draft, setDraft] = useState<ProductionDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function compile() {
    setError("");
    setLoading(true);
    try {
      const res = await getProductionDraft(projectId, from, to);
      if (res.error) setError(res.error);
      setDraft(res.error ? null : res);
    } catch {
      setError("Couldn't compile the daily logs. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Show the default range right away.
  useEffect(() => {
    if (from && to) void compile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usable = draft?.rows.filter((r) => r.inSov) || [];

  function carryOn() {
    if (!draft) return;
    onContinue({
      appNumber: draft.suggestedAppNumber,
      period: `${shortDate(from)} - ${shortDate(to)}`,
      retainagePercent: draft.retainagePercent,
      quantities: Object.fromEntries(usable.map((r) => [r.itemNo, r.qty])),
      logFrom: from,
      logTo: to,
    });
  }

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <h2 style={{ marginBottom: 6, textTransform: "uppercase" }}>Generate from Daily Logs</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.84rem", marginBottom: 16 }}>
          Adds up everything the foremen logged as installed between these dates and fills it into a new pay application, which you review before saving.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={labelStyle}>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={labelStyle}>Through</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </label>
          <button type="button" onClick={compile} disabled={loading || !from || !to} style={secondaryBtnStyle}>
            {loading ? "Compiling…" : "Compile"}
          </button>
        </div>

        {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 10 }}>{error}</p>}

        {draft && (
          <>
            {draft.warnings.length > 0 && (
              <div style={{ border: "1px solid var(--danger)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: "0.82rem" }}>
                <strong style={{ color: "var(--danger)" }}>Check before billing</strong>
                <ul style={{ margin: "6px 0 0 18px" }}>
                  {draft.warnings.map((w, i) => (
                    <li key={i} style={{ marginBottom: 3 }}>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {draft.rows.length ? (
              <>
                <p style={{ fontSize: "0.84rem", marginBottom: 8 }}>
                  {draft.logCount} daily log{draft.logCount === 1 ? "" : "s"} on {draft.dayCount} day{draft.dayCount === 1 ? "" : "s"}, {draft.rows.length} line item{draft.rows.length === 1 ? "" : "s"}.
                </p>
                <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 16 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr>
                        {["Item", "Description", "This period", "Billed before", "Bid qty", "By day"].map((h) => (
                          <th key={h} style={thStyle}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.rows.map((r) => (
                        <tr key={r.itemNo} style={{ opacity: r.inSov ? 1 : 0.55 }}>
                          <td style={tdMono}>{r.itemNo}</td>
                          <td style={td}>{r.description}</td>
                          <td style={{ ...tdMono, fontWeight: 700 }}>
                            {fmtQty(r.qty)}
                            {r.unit ? ` ${r.unit}` : ""}
                          </td>
                          <td style={tdMono}>{r.inSov ? fmtQty(r.prevQty) : "—"}</td>
                          <td style={tdMono}>{r.inSov && r.bidQty ? fmtQty(r.bidQty) : "—"}</td>
                          <td style={{ ...td, color: "var(--muted)", fontSize: "0.74rem" }}>{r.days.map((d) => `${shortDate(d.date)}: ${fmtQty(d.qty)}`).join(" · ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: 16 }}>
                No production was logged between {shortDate(from)} and {shortDate(to)}.
              </p>
            )}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>
            Cancel
          </button>
          <button type="button" onClick={carryOn} disabled={!usable.length} style={{ ...primaryBtnStyle, opacity: usable.length ? 1 : 0.5 }}>
            Continue to pay application
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(20,18,15,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto", zIndex: 50 };
const modalStyle: React.CSSProperties = { background: "var(--surface)", borderRadius: 12, width: "100%", maxWidth: 900, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", border: "1px solid var(--border)" };
const labelStyle: React.CSSProperties = { fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: 600 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "9px 10px", fontSize: "0.92rem", color: "var(--ink)", fontFamily: "inherit" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: "0.66rem", textTransform: "uppercase", color: "var(--muted)", padding: "6px 9px", background: "var(--surface-2)" };
const td: React.CSSProperties = { padding: "6px 9px", borderBottom: "1px solid var(--border)" };
const tdMono: React.CSSProperties = { ...td, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" };
