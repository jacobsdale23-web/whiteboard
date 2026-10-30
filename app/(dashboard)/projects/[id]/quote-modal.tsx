"use client";

import { useRef, useState } from "react";
import { MAX_PROJECT_FILE_MB } from "@/lib/project-files";
import { linesTotal } from "@/lib/quotes";
import { requestProjectFileUpload, confirmProjectFileUpload } from "./project-file-actions";
import { saveQuote, scanQuoteFile } from "./quote-actions";

export type QuoteRow = {
  id: string;
  number: string;
  quoteDate: string | null;
  customer: string | null;
  total: number;
  status: string;
  expires: string | null;
  qbLink: string | null;
  lines: { description: string; qty: number; amount: number }[];
  fileId: string | null;
  billedInvoiceNo: string | null;
  billedDate: string | null;
  billedAmount: number | null;
  billedBy: string | null;
};

type Line = { description: string; qty: string; amount: string };

export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Attach a quote to the job (or fix one already attached). Upload the QuickBooks PDF and the details are read from
// it; everything stays editable because the numbers here are what the job is billed against.
export default function QuoteModal({ projectId, customer, quote, onClose }: { projectId: string; customer: string | null; quote?: QuoteRow; onClose: () => void }) {
  const [number, setNumber] = useState(quote?.number || "");
  const [quoteDate, setQuoteDate] = useState(quote?.quoteDate || "");
  const [cust, setCust] = useState(quote?.customer || customer || "");
  const [total, setTotal] = useState(quote ? String(quote.total) : "");
  const [expires, setExpires] = useState(quote?.expires || "");
  const [qbLink, setQbLink] = useState(quote?.qbLink || "");
  const [lines, setLines] = useState<Line[]>(quote ? quote.lines.map((l) => ({ description: l.description, qty: String(l.qty), amount: String(l.amount) })) : [{ description: "", qty: "1", amount: "" }]);
  const [fileId, setFileId] = useState<string | null>(quote?.fileId || null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState<"" | "reading" | "saving">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...p } : l)));
  const sum = linesTotal(lines.map((l) => ({ description: l.description, qty: 1, amount: Number(l.amount) || 0 })));
  const totalNum = Number(total.replace(/[$,\s]/g, "")) || 0;

  async function pickFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setNote("");
    if (file.size > MAX_PROJECT_FILE_MB * 1024 * 1024) return setError(`That file is over ${MAX_PROJECT_FILE_MB} MB.`);
    setBusy("reading");
    try {
      const requested = await requestProjectFileUpload(projectId, file.name, "Quote");
      if (requested.error || !requested.uploadUrl || !requested.id || !requested.storageKey || !requested.contentType) return setError(requested.error || "Couldn't start the upload.");
      const put = await fetch(requested.uploadUrl, { method: "PUT", headers: { "Content-Type": requested.contentType }, body: file });
      if (!put.ok) return setError("The upload to storage failed. Please try again.");
      const confirmed = await confirmProjectFileUpload(projectId, { id: requested.id, kind: "Quote", filename: file.name, storageKey: requested.storageKey, fileSize: file.size });
      if (confirmed.error) return setError(confirmed.error);
      setFileId(requested.id);
      setFileName(file.name);

      const scan = await scanQuoteFile(projectId, requested.id);
      if (scan.error) return setNote(scan.error);
      if (scan.number) setNumber(scan.number);
      if (scan.quoteDate) setQuoteDate(scan.quoteDate);
      if (scan.expires) setExpires(scan.expires);
      if (scan.customer) setCust(scan.customer);
      if (scan.total != null) setTotal(String(scan.total));
      if (scan.lines?.length) setLines(scan.lines.map((l) => ({ description: l.description, qty: String(l.qty), amount: String(l.amount) })));
      setNote("Filled in from the PDF. Check it against the quote before saving.");
    } catch {
      setError("Something went wrong reading that file. You can type the details in instead.");
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function save() {
    setError("");
    setBusy("saving");
    try {
      const res = await saveQuote(projectId, { number, quoteDate, customer: cust, total, expires, qbLink, lines, fileId }, quote?.id);
      if (res.error) {
        setError(res.error);
        setBusy("");
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the quote.");
      setBusy("");
    }
  }

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalStyle}>
        <h2 style={{ marginBottom: 6, textTransform: "uppercase" }}>{quote ? "Edit Quote" : "Attach Quote"}</h2>
        <p style={{ color: "var(--muted)", fontSize: "0.84rem", marginBottom: 16 }}>
          The QuickBooks quote this job is billed from. It stays with the job like a contract does, so when the work is done you can check it against the daily logs and bill it.
        </p>

        <div style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 16, background: "var(--surface-2)" }}>
          <label style={labelStyle}>Quote PDF from QuickBooks (optional)</label>
          <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0 0 8px" }}>
            In QuickBooks open the estimate and choose Print or download. Upload it here and the number, total and scope are filled in for you.
          </p>
          <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => pickFile(e.target.files?.[0])} disabled={busy !== ""} style={{ fontSize: "0.82rem" }} />
          {busy === "reading" && <span style={{ fontSize: "0.8rem", marginLeft: 8, color: "var(--muted)" }}>Uploading and reading…</span>}
          {fileId && !busy && <div style={{ fontSize: "0.78rem", marginTop: 6, color: "var(--ink-soft)" }}>✓ PDF attached{fileName ? `: ${fileName}` : ""}</div>}
          {note && <div style={{ fontSize: "0.78rem", marginTop: 6, color: "var(--ink-soft)" }}>{note}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
          <Field label="Quote #">
            <input value={number} onChange={(e) => setNumber(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Quote date">
            <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Expires">
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Total">
            <input type="number" step="any" value={total} onChange={(e) => setTotal(e.target.value)} style={inputStyle} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 14 }}>
          <Field label="Customer">
            <input value={cust} onChange={(e) => setCust(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="QuickBooks link (optional)">
            <input value={qbLink} onChange={(e) => setQbLink(e.target.value)} placeholder="Paste the address of the estimate in QuickBooks" style={inputStyle} />
          </Field>
        </div>

        <label style={labelStyle}>Scope as quoted</label>
        <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr>
                {["Description", "Qty", "Amount", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", fontSize: "0.68rem", textTransform: "uppercase", color: "var(--muted)", padding: "6px 6px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ padding: "3px 4px" }}>
                    <textarea value={l.description} onChange={(e) => patch(i, { description: e.target.value })} rows={2} style={{ ...cellInputStyle, width: "100%", minWidth: 280, resize: "vertical" }} />
                  </td>
                  <td style={{ padding: "3px 4px", verticalAlign: "top" }}>
                    <input type="number" step="any" value={l.qty} onChange={(e) => patch(i, { qty: e.target.value })} style={{ ...cellInputStyle, width: 64 }} />
                  </td>
                  <td style={{ padding: "3px 4px", verticalAlign: "top" }}>
                    <input type="number" step="any" value={l.amount} onChange={(e) => patch(i, { amount: e.target.value })} style={{ ...cellInputStyle, width: 100 }} />
                  </td>
                  <td style={{ padding: "3px 4px", verticalAlign: "top" }}>
                    <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : [{ description: "", qty: "1", amount: "" }]))} style={deleteBtnStyle} aria-label="Remove line">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => setLines((ls) => [...ls, { description: "", qty: "1", amount: "" }])} style={{ ...addBtnStyle, marginBottom: 8 }}>
          + Add line
        </button>
        {totalNum > 0 && sum > 0 && Math.abs(sum - totalNum) > 0.005 && (
          <p style={{ fontSize: "0.78rem", color: "var(--danger)", marginBottom: 8 }}>
            The lines add up to {money(sum)} but the total is {money(totalNum)}. Fine if the quote has tax or a discount; otherwise check them.
          </p>
        )}

        {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 8 }}>{error}</p>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy !== ""} style={primaryBtnStyle}>
            {busy === "saving" ? "Saving…" : quote ? "Save Quote" : "Attach Quote"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(20,18,15,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto", zIndex: 50 };
const modalStyle: React.CSSProperties = { background: "var(--surface)", borderRadius: 12, width: "100%", maxWidth: 820, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", border: "1px solid var(--border)" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.88rem", color: "var(--ink)", fontFamily: "inherit", width: "100%" };
const cellInputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 5, padding: "6px 7px", fontSize: "0.82rem", color: "var(--ink)", fontFamily: "inherit" };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 24, height: 24, cursor: "pointer", color: "var(--muted)" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
