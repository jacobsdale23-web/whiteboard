"use client";

import { useState, useTransition } from "react";
import { analyzeStatement, confirmStatementMatch, type StatementResult } from "./statement-actions";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

function csvCell(s: string | number) {
  const t = String(s);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function download(name: string, rows: (string | number)[][]) {
  const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// Upload a Capital One export: it is matched to the receipts foremen scanned and totalled by job, ready to enter as split lines on the lump entry in QuickBooks.
export default function StatementTool() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<StatementResult | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function analyze(text: string) {
    setError("");
    startTransition(async () => {
      const res = await analyzeStatement(text);
      if (res.error) setError(res.error);
      setResult(res.error ? null : res);
    });
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    setCsv(text);
    setFileName(f.name);
    analyze(text);
  }

  function confirm(receiptId: string, key: string) {
    startTransition(async () => {
      const res = await confirmStatementMatch(receiptId, key);
      if (res.error) setError(res.error);
      else analyze(csv);
    });
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: "1.05rem", marginBottom: 2 }}>Capital One statement</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: 8 }}>
        Export the transactions from Capital One as CSV and choose the file. White Board matches each charge to a scanned receipt and totals the charges by job, so you can enter those totals as split lines on your lump entry in QuickBooks. Nothing is sent to QuickBooks.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} disabled={pending} />
      {fileName && <span style={{ color: "var(--muted)", fontSize: "0.8rem", marginLeft: 8 }}>{fileName}</span>}
      {pending && <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 8 }}>Working…</p>}
      {error && <p style={{ color: "var(--danger)", fontSize: "0.88rem", marginTop: 8 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: "0.9rem", marginBottom: 10 }}>
            {result.lineCount} lines · charges {money(result.chargeTotal)}
            {result.creditTotal > 0 ? ` · payments and credits ${money(result.creditTotal)} (left out)` : ""}
            {result.autoMatchedNow > 0 ? ` · ${result.autoMatchedNow} receipts matched just now` : ""}
          </p>
          {result.problems.map((p) => (
            <p key={p} style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{p}</p>
          ))}

          <h4 style={{ fontSize: "0.95rem", margin: "10px 0 4px" }}>Split by job</h4>
          <div style={box}>
            {result.split.map((s) => (
              <Row key={s.job} left={<>{s.job} <Sub>· {s.count} charge{s.count === 1 ? "" : "s"}</Sub></>} right={money(s.total)} />
            ))}
            <Row left={<strong>No receipt matched yet</strong>} right={money(result.unmatchedTotal)} />
            <Row left={<strong>Statement total</strong>} right={<strong>{money(result.split.reduce((s, x) => s + x.total, 0) + result.unmatchedTotal)}</strong>} />
          </div>
          <div style={{ display: "flex", gap: 8, margin: "8px 0 16px" }}>
            <button style={btn} onClick={() => download("split-by-job.csv", [["Job", "Charges", "Total"], ...result.split.map((s) => [s.job, s.count, s.total.toFixed(2)]), ["No receipt matched", "", result.unmatchedTotal.toFixed(2)]])}>
              Download split (CSV)
            </button>
            <button style={btn} onClick={() => download("statement-detail.csv", [["Date", "Description", "Card", "Amount", "Job", "Receipt"], ...result.lines.filter((l) => !l.credit).map((l) => [l.date, l.description, l.card, l.amount.toFixed(2), l.job || "", l.receipt || ""])])}>
              Download every charge with its job (CSV)
            </button>
          </div>

          {result.review.length > 0 && (
            <>
              <h4 style={{ fontSize: "0.95rem", margin: "10px 0 4px" }}>Needs your eye ({result.review.length})</h4>
              <div style={box}>
                {result.review.map((r) => (
                  <Row
                    key={r.receiptId}
                    left={
                      <>
                        <strong>{r.receipt.vendor || "Receipt"}</strong> {money(r.receipt.amount)} <Sub>· {r.receipt.date} · {r.receipt.project} · {r.receipt.by}</Sub>
                        <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                          → {r.line.date}: {r.line.description} {money(r.line.amount)} · {r.note}
                        </div>
                      </>
                    }
                    right={
                      <button disabled={pending} style={btn} onClick={() => confirm(r.receiptId, r.key)}>
                        Confirm match
                      </button>
                    }
                  />
                ))}
              </div>
            </>
          )}

          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Charges with no receipt ({result.lines.filter((l) => !l.credit && !l.job).length})</summary>
            <div style={box}>
              {result.lines.filter((l) => !l.credit && !l.job).map((l) => (
                <Row key={l.key} left={<>{l.description} <Sub>· {l.date}{l.card ? ` · card ${l.card}` : ""}</Sub></>} right={money(l.amount)} />
              ))}
            </div>
          </details>

          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Receipts with no charge in this file ({result.receiptsWithoutCharge.length})</summary>
            <div style={box}>
              {result.receiptsWithoutCharge.map((r) => (
                <Row key={r.id} left={<>{r.vendor || "Receipt"} <Sub>· {r.date} · {r.project} · {r.by}</Sub></>} right={money(r.amount)} />
              ))}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)", fontSize: "0.88rem" }}>
      <div style={{ minWidth: 0 }}>{left}</div>
      <div style={{ fontFamily: "var(--font-mono)" }}>{right}</div>
    </div>
  );
}
const Sub = ({ children }: { children: React.ReactNode }) => <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{children}</span>;
const box: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "2px 14px" };
const btn: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "7px 12px", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem" };
