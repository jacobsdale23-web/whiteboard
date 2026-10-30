"use client";

import { useState } from "react";
import { billingChecks } from "@/lib/quotes";
import { getProjectFileDownloadUrl } from "./project-file-actions";
import { clearQuoteBilled, createInvoiceFromQuote, deleteQuote, recordQuoteBilled } from "./quote-actions";
import QuoteModal, { money, type QuoteRow } from "./quote-modal";
import type { QbStatus } from "./billing-section";
import { openLater } from "@/lib/open-later";
import { qbInvoiceLink } from "@/lib/qb-invoice";

type CardLog = { id: string; date: string; foreman: string | null; description: string | null; scopeChange: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string | null) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
};

// A small job's quote, kept with the job like a contract: what was quoted, the daily logs that confirm what was done,
// and the hand-off to QuickBooks to bill it. The invoice itself is made in QuickBooks.
export default function QuoteCard({ projectId, customer, jobStatus, qb, quotes, logs }: { projectId: string; customer: string | null; jobStatus: string; qb: QbStatus; quotes: QuoteRow[]; logs: CardLog[] }) {
  const [editing, setEditing] = useState<QuoteRow | "new" | null>(null);
  const [error, setError] = useState("");

  const sortedLogs = logs.slice().sort((a, b) => a.date.localeCompare(b.date));
  const { checks, ready } = billingChecks(sortedLogs, jobStatus);
  const unbilled = quotes.filter((q) => !q.billedInvoiceNo);
  const flagged = sortedLogs.filter((l) => l.scopeChange);

  async function openPdf(fileId: string) {
    try {
      window.open(await getProjectFileDownloadUrl(projectId, fileId), "_blank");
    } catch {
      setError("Couldn't open that file.");
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Quote &amp; Billing</h3>
          <p style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>
            For jobs billed from a QuickBooks quote. Keep the quote here, check it against the daily logs, then bill it in QuickBooks.
          </p>
        </div>
        <button onClick={() => setEditing("new")} style={addBtnStyle}>
          {quotes.length ? "+ Attach Another Quote" : "+ Attach Quote"}
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 10 }}>{error}</p>}

      {!quotes.length && <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No quote attached yet. Attach the QuickBooks quote and it will be here when it&apos;s time to bill.</p>}

      {quotes.map((q) => (
        <QuoteBlock key={q.id} projectId={projectId} quote={q} qb={qb} ready={ready} onEdit={() => setEditing(q)} onOpenPdf={openPdf} setError={setError} />
      ))}

      {unbilled.length > 0 && (
        <div style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", background: "var(--surface-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <strong style={{ fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)" }}>Before you bill</strong>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: ready ? "var(--active)" : "var(--danger)" }}>{ready ? "All clear" : "Needs a look"}</span>
          </div>
          {checks.map((c) => (
            <div key={c.key} style={{ display: "flex", gap: 8, fontSize: "0.84rem", marginBottom: 6 }}>
              <span style={{ color: c.ok ? "var(--active)" : "var(--danger)", fontWeight: 700, width: 16 }}>{c.ok ? "✓" : "!"}</span>
              <div>
                <strong>{c.label}.</strong> <span style={{ color: "var(--ink-soft)" }}>{c.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {sortedLogs.length > 0 && (
        <details open={flagged.length > 0 || sortedLogs.length <= 4} style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", fontSize: "0.82rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>
            What the crew logged ({sortedLogs.length})
          </summary>
          <div style={{ marginTop: 8 }}>
            {sortedLogs.map((l) => (
              <div key={l.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: "0.84rem" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "var(--muted)" }}>
                  {l.date}
                  {l.foreman ? ` · ${l.foreman}` : ""}
                  {l.scopeChange && <span style={flagStyle}>Scope change</span>}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{l.description}</div>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => window.open(`/projects/${projectId}/logs-pdf?from=${sortedLogs[0].date}&to=${sortedLogs[sortedLogs.length - 1].date}`, "_blank")}
                style={addBtnStyle}
              >
                Daily logs PDF
              </button>
            </div>
          </div>
        </details>
      )}

      {editing && <QuoteModal projectId={projectId} customer={customer} quote={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function QuoteBlock({
  projectId,
  quote: q,
  qb,
  ready,
  onEdit,
  onOpenPdf,
  setError,
}: {
  projectId: string;
  quote: QuoteRow;
  qb: QbStatus;
  ready: boolean;
  onEdit: () => void;
  onOpenPdf: (fileId: string) => void;
  setError: (s: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState(String(q.total));
  const [markBilled, setMarkBilled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");

  // Creates the invoice in QuickBooks from this quote and opens it there to review and send.
  function createInvoice() {
    const warn = ready ? "" : "\n\nHeads up: the Before you bill checks aren't all clear.";
    if (!confirm(`Create the invoice for quote #${q.number} (${money(q.total)}) in QuickBooks${qb.companyName ? ` (${qb.companyName})` : ""}? It is saved there, not emailed, and opens for you to review.${warn}`)) return;
    setInfo("");
    const show = openLater();
    void run(async () => {
      const res = await createInvoiceFromQuote(projectId, q.id);
      if (res.note) setInfo(res.note);
      show(res.link);
      return res;
    });
  }

  async function run(fn: () => Promise<{ error?: string }>) {
    setError("");
    setBusy(true);
    try {
      const res = await fn();
      if (res.error) setError(res.error);
      else setRecording(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const billed = !!q.billedInvoiceNo;
  const differs = billed && q.billedAmount != null && Math.abs(q.billedAmount - q.total) > 0.005;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700 }}>
            Quote #{q.number}
            <span style={chipStyle}>{billed ? "Billed" : q.status}</span>
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 2 }}>
            {[q.customer, q.quoteDate && `dated ${fmtDate(q.quoteDate)}`, q.expires && `expires ${fmtDate(q.expires)}`].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1.1rem" }}>{money(q.total)}</div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
            {q.fileId && (
              <button onClick={() => onOpenPdf(q.fileId!)} style={smallBtnStyle}>
                View PDF
              </button>
            )}
            <button onClick={onEdit} style={smallBtnStyle}>
              Edit
            </button>
            <button
              onClick={() => {
                if (confirm(`Remove quote #${q.number} from this job? The PDF stays in the job's documents.`)) void run(() => deleteQuote(projectId, q.id));
              }}
              style={smallBtnStyle}
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      {q.lines.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", marginBottom: 4 }}>Quoted scope</div>
          {q.lines.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.84rem", padding: "3px 0" }}>
              <span style={{ whiteSpace: "pre-wrap" }}>
                {l.qty !== 1 ? `${l.qty} × ` : ""}
                {l.description}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{money(l.amount)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        {billed ? (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ fontSize: "0.86rem" }}>
              <strong style={{ color: "var(--active)" }}>Billed in QuickBooks</strong> · Invoice #{q.billedInvoiceNo} · {fmtDate(q.billedDate)} · {q.billedAmount != null ? money(q.billedAmount) : ""}
              {q.billedBy ? ` · recorded by ${q.billedBy}` : ""}
              {q.qbInvoiceId && qb.realmId && (
                <>
                  {" · "}
                  <a href={qbInvoiceLink(qb.realmId, q.qbInvoiceId)} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                    Open in QuickBooks ↗
                  </a>
                </>
              )}
              {differs && <div style={{ color: "var(--danger)", fontSize: "0.78rem", marginTop: 2 }}>Differs from the quote by {money(Math.abs((q.billedAmount ?? 0) - q.total))}.</div>}
            </div>
            <button
              onClick={() => {
                if (confirm("Clear the invoice recorded for this quote?")) void run(() => clearQuoteBilled(projectId, q.id));
              }}
              disabled={busy}
              style={smallBtnStyle}
            >
              Undo
            </button>
          </div>
        ) : recording ? (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={labelStyle}>QuickBooks invoice #</span>
                <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} style={{ ...inputStyle, width: 150 }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={labelStyle}>Invoice date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={labelStyle}>Amount</span>
                <input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: 130 }} />
              </label>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", marginTop: 10 }}>
              <input type="checkbox" checked={markBilled} onChange={(e) => setMarkBilled(e.target.checked)} />
              Mark the job Billed
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button disabled={busy} onClick={() => run(() => recordQuoteBilled(projectId, q.id, { invoiceNo, date, amount, markJobBilled: markBilled }))} style={primaryBtnStyle}>
                {busy ? "Saving…" : "Save invoice"}
              </button>
              <button onClick={() => setRecording(false)} style={secondaryBtnStyle}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {qb.connected ? (
              <button onClick={createInvoice} disabled={busy} style={primaryBtnStyle} title="Creates the invoice in QuickBooks from this quote, with the daily logs attached, and opens it">
                {busy ? "Creating…" : "Create invoice in QuickBooks"}
              </button>
            ) : (
              <>
                <a href={q.qbLink || "https://qbo.intuit.com/app/estimates"} target="_blank" rel="noreferrer" style={{ ...primaryBtnStyle, textDecoration: "none", display: "inline-block" }}>
                  {q.qbLink ? "Open quote in QuickBooks ↗" : "Open QuickBooks estimates ↗"}
                </a>
                {qb.configured && (
                  <a href={`/api/quickbooks/connect?returnTo=${encodeURIComponent(`/projects/${projectId}`)}`} style={{ ...secondaryBtnStyle, textDecoration: "none", display: "inline-block" }} title="One-time sign-in so White Board can create the invoice for you">
                    Connect QuickBooks
                  </a>
                )}
              </>
            )}
            {qb.connected && q.qbLink && (
              <a href={q.qbLink} target="_blank" rel="noreferrer" style={{ ...secondaryBtnStyle, textDecoration: "none", display: "inline-block" }}>
                Open quote in QuickBooks ↗
              </a>
            )}
            <button onClick={() => setRecording(true)} style={secondaryBtnStyle}>
              I billed it — record invoice
            </button>
            <span style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
              {qb.connected
                ? "Opens the new invoice in QuickBooks to review. Nothing is emailed."
                : q.qbLink
                  ? "In QuickBooks choose Create invoice, then come back and record the invoice number."
                  : `Find quote #${q.number} in QuickBooks and choose Create invoice.`}
            </span>
          </div>
          {info && <p style={{ fontSize: "0.8rem", color: "var(--ink-soft)", marginTop: 8 }}>{info}</p>}
          </>
        )}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20 };
const labelStyle: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.88rem", color: "var(--ink)", fontFamily: "inherit" };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const smallBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "4px 10px", borderRadius: 6, fontSize: "0.74rem", fontWeight: 600, cursor: "pointer" };
const chipStyle: React.CSSProperties = { marginLeft: 8, background: "var(--surface-2)", color: "var(--ink-soft)", fontSize: "0.66rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase" };
const flagStyle: React.CSSProperties = { marginLeft: 8, background: "var(--danger)", color: "#fff", fontSize: "0.64rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase", fontFamily: "inherit" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
