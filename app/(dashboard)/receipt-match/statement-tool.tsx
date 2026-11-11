"use client";

import { useMemo, useState, useTransition } from "react";
import { analyzeStatement, assignCharge, clearChargeAssignment, confirmStatementMatch, removeVendorRule, type StatementLineOut, type StatementResult } from "./statement-actions";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const round = (n: number) => Math.round(n * 100) / 100;

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

const SOURCE_LABEL = { receipt: "receipt", manual: "assigned by hand", rule: "remembered vendor" } as const;

// Upload a Capital One export: it is matched to the receipts foremen scanned and totalled by job, ready to enter as split lines on the lump entry in QuickBooks.
export default function StatementTool() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<StatementResult | null>(null);
  const [error, setError] = useState("");
  const [card, setCard] = useState(""); // "" = all cards
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pickJob, setPickJob] = useState("");
  const [remember, setRemember] = useState(false);
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
    setCard("");
    analyze(text);
  }

  function act(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        setAssigning(null);
        setPickJob("");
        setRemember(false);
        analyze(csv);
      }
    });
  }

  const shown: StatementLineOut[] = useMemo(() => (result ? result.lines.filter((l) => !card || l.card === card) : []), [result, card]);
  const charges = shown.filter((l) => !l.credit);
  const split = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    for (const l of charges) {
      if (!l.job) continue;
      const cur = m.get(l.job) ?? { count: 0, total: 0 };
      cur.count++;
      cur.total += l.amount;
      m.set(l.job, cur);
    }
    return [...m.entries()].map(([job, v]) => ({ job, count: v.count, total: round(v.total) })).sort((a, b) => a.job.localeCompare(b.job, undefined, { numeric: true }));
  }, [charges]);
  const unmatched = charges.filter((l) => !l.job);
  const unmatchedTotal = round(unmatched.reduce((s, l) => s + l.amount, 0));
  const creditTotal = round(shown.filter((l) => l.credit).reduce((s, l) => s + l.amount, 0));
  const grand = round(split.reduce((s, x) => s + x.total, 0) + unmatchedTotal);
  const bySource = (src: string) => charges.filter((l) => l.source === src).length;

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
          {result.cards.length > 1 && (
            <label style={{ fontSize: "0.85rem", display: "block", marginBottom: 8 }}>
              Card{" "}
              <select value={card} onChange={(e) => setCard(e.target.value)} style={sel}>
                <option value="">All cards ({result.cards.length})</option>
                {result.cards.map((c) => (
                  <option key={c} value={c}>
                    Card ending {c.slice(-4)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p style={{ fontSize: "0.9rem", marginBottom: 10 }}>
            {shown.length} lines · charges {money(round(charges.reduce((s, l) => s + l.amount, 0)))}
            {creditTotal > 0 ? ` · payments and credits ${money(creditTotal)} (left out)` : ""}
            {` · ${bySource("receipt")} by receipt, ${bySource("manual")} by hand, ${bySource("rule")} by remembered vendor`}
            {result.autoMatchedNow > 0 ? ` · ${result.autoMatchedNow} receipts matched just now` : ""}
          </p>
          {result.problems.map((p) => (
            <p key={p} style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{p}</p>
          ))}

          <h4 style={{ fontSize: "0.95rem", margin: "10px 0 4px" }}>Split by job</h4>
          <div style={box}>
            {split.map((s) => (
              <Row key={s.job} left={<>{s.job} <Sub>· {s.count} charge{s.count === 1 ? "" : "s"}</Sub></>} right={money(s.total)} />
            ))}
            <Row left={<strong>No job yet</strong>} right={money(unmatchedTotal)} />
            <Row left={<strong>Statement total</strong>} right={<strong>{money(grand)}</strong>} />
          </div>
          <div style={{ display: "flex", gap: 8, margin: "8px 0 16px", flexWrap: "wrap" }}>
            <button style={btn} onClick={() => download("split-by-job.csv", [["Job", "Charges", "Total"], ...split.map((s) => [s.job, s.count, s.total.toFixed(2)]), ["No job yet", unmatched.length, unmatchedTotal.toFixed(2)]])}>
              Download split (CSV)
            </button>
            <button style={btn} onClick={() => download("statement-detail.csv", [["Date", "Description", "Card", "Amount", "Job", "How"], ...charges.map((l) => [l.date, l.description, l.card, l.amount.toFixed(2), l.job || "", l.source ? SOURCE_LABEL[l.source] : ""])])}>
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
                      <button disabled={pending} style={btn} onClick={() => act(() => confirmStatementMatch(r.receiptId, r.key))}>
                        Confirm match
                      </button>
                    }
                  />
                ))}
              </div>
            </>
          )}

          <h4 style={{ fontSize: "0.95rem", margin: "14px 0 2px" }}>Charges with no job yet ({unmatched.length})</h4>
          <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginBottom: 4 }}>No scanned receipt matched these. Put one on a job yourself, and tick the box to remember the vendor (a hardware store that is always shop supplies, for example) so next month's charge lands there on its own.</p>
          <div style={box}>
            {unmatched.map((l) => (
              <div key={l.key} style={{ borderBottom: "1px solid var(--border)", padding: "9px 0", fontSize: "0.88rem" }}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div>
                    {l.description} <Sub>· {l.date}{l.card ? ` · card ${l.card.slice(-4)}` : ""}</Sub>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{money(l.amount)}</span>
                    <button style={btn} onClick={() => { setAssigning(assigning === l.key ? null : l.key); setPickJob(""); setRemember(false); }}>
                      Assign to a job
                    </button>
                  </div>
                </div>
                {assigning === l.key && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <select value={pickJob} onChange={(e) => setPickJob(e.target.value)} style={{ ...sel, minWidth: 240 }}>
                      <option value="">Pick a job…</option>
                      {result.jobOptions.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.label}
                        </option>
                      ))}
                    </select>
                    <label style={{ fontSize: "0.8rem" }}>
                      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Always use this job for this vendor
                    </label>
                    <button disabled={pending || !pickJob} style={{ ...btn, background: "var(--rust)", color: "var(--rust-ink)" }} onClick={() => act(() => assignCharge({ key: l.key, date: l.date, description: l.description, amount: l.amount, card: l.card }, pickJob, remember))}>
                      Save
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!unmatched.length && <p style={{ color: "var(--muted)", padding: "10px 0", fontSize: "0.85rem" }}>Every charge has a job.</p>}
          </div>

          {charges.some((l) => l.source === "manual" || l.source === "rule") && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Charges put on a job without a receipt ({charges.filter((l) => l.source === "manual" || l.source === "rule").length})</summary>
              <div style={box}>
                {charges.filter((l) => l.source === "manual" || l.source === "rule").map((l) => (
                  <Row
                    key={l.key}
                    left={<>{l.description} <Sub>· {l.date} · {l.job} · {l.source === "rule" ? `remembered vendor “${l.ruleLabel}”` : "assigned by hand"}</Sub></>}
                    right={
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                        {money(l.amount)}
                        {l.source === "manual" && (
                          <button disabled={pending} style={btn} onClick={() => act(() => clearChargeAssignment(l.key))}>
                            Clear
                          </button>
                        )}
                      </span>
                    }
                  />
                ))}
              </div>
            </details>
          )}

          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Remembered vendors ({result.rules.length})</summary>
            <div style={box}>
              {result.rules.map((r) => (
                <Row
                  key={r.id}
                  left={<>{r.label} <Sub>→ {r.job}</Sub></>}
                  right={
                    <button disabled={pending} style={btn} onClick={() => act(() => removeVendorRule(r.id))}>
                      Forget
                    </button>
                  }
                />
              ))}
              {!result.rules.length && <p style={{ color: "var(--muted)", padding: "10px 0", fontSize: "0.85rem" }}>None yet. Tick &ldquo;Always use this job for this vendor&rdquo; when you assign a charge.</p>}
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
const sel: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit" };
