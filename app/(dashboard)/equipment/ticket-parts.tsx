"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestInvoiceUpload, addTicketCost, getInvoiceUrl, deleteTicketCost } from "./cost-actions";

export type PartCost = {
  id: string;
  vendor: string | null;
  description: string | null;
  amount: number;
  filename: string | null;
  uploadedBy: string;
  uploadedById: string;
  createdAt: string;
};

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function TicketParts({ ticketId, costs, currentUserId, isAdmin }: { ticketId: string; costs: PartCost[]; currentUserId: string; isAdmin: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const total = costs.reduce((n, c) => n + c.amount, 0);

  async function submit(fd: FormData) {
    setError("");
    const amount = Number(fd.get("amount"));
    const file = fd.get("file");
    setBusy(true);
    try {
      let upload: { storageKey: string; filename: string; contentType: string } | undefined;
      if (file instanceof File && file.size) {
        const req = await requestInvoiceUpload(ticketId, file.name);
        if (req.error || !req.uploadUrl || !req.storageKey || !req.contentType) return setError(req.error || "Couldn't start the upload.");
        const put = await fetch(req.uploadUrl, { method: "PUT", headers: { "Content-Type": req.contentType }, body: file });
        if (!put.ok) return setError("Upload to storage failed. Please try again.");
        upload = { storageKey: req.storageKey, filename: file.name, contentType: req.contentType };
      }
      const res = await addTicketCost(ticketId, {
        vendor: String(fd.get("vendor") || ""),
        description: String(fd.get("description") || ""),
        amount,
        ...upload,
      });
      if (res.error) return setError(res.error);
      if (fileRef.current) fileRef.current.value = "";
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't save that invoice. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function view(id: string) {
    const res = await getInvoiceUrl(id);
    if (res.url) window.open(res.url, "_blank");
    else setError(res.error || "Couldn't open the file.");
  }

  function remove(id: string) {
    setError("");
    startTransition(async () => {
      const res = await deleteTicketCost(id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={labelStyle}>
          Parts &amp; repair cost {costs.length > 0 && <span style={{ color: "var(--ink)", fontFamily: "var(--font-mono)" }}>· {money(total)}</span>}
        </div>
        <button onClick={() => setOpen((o) => !o)} style={linkBtnStyle}>
          {open ? "Cancel" : "+ Add parts invoice"}
        </button>
      </div>

      {costs.map((c) => (
        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "0.82rem", padding: "5px 0", borderTop: "1px solid var(--border)" }}>
          <div>
            <strong>{money(c.amount)}</strong>
            {c.vendor ? ` · ${c.vendor}` : ""}
            {c.description && <div style={{ color: "var(--muted)" }}>{c.description}</div>}
            <div style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
              Added by {c.uploadedBy} · {new Date(c.createdAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexShrink: 0 }}>
            {c.filename && (
              <button onClick={() => view(c.id)} style={linkBtnStyle} title={c.filename}>
                View invoice
              </button>
            )}
            {(isAdmin || c.uploadedById === currentUserId) && (
              <button onClick={() => remove(c.id)} style={{ ...linkBtnStyle, color: "var(--danger)" }}>
                Remove
              </button>
            )}
          </div>
        </div>
      ))}

      {open && (
        <form action={submit} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, background: "var(--bg)", marginTop: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label style={labelStyle}>Amount ($)</label>
              <input name="amount" type="number" min="0.01" step="0.01" required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Vendor</label>
              <input name="vendor" placeholder="e.g. NAPA, Holt CAT" style={inputStyle} />
            </div>
          </div>
          <label style={labelStyle}>What it was for</label>
          <input name="description" placeholder="e.g. hydraulic hose, thermostat" style={inputStyle} />
          <label style={labelStyle}>Invoice or receipt (PDF or photo, optional)</label>
          <input ref={fileRef} name="file" type="file" accept="application/pdf,image/*,.heic" style={{ fontSize: "0.8rem", marginBottom: 10 }} />
          <div>
            <button type="submit" disabled={busy} style={primaryBtnStyle}>
              {busy ? "Uploading…" : "Save invoice"}
            </button>
          </div>
        </form>
      )}

      {error && <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.7rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 4 };
const inputStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit", width: "100%", marginBottom: 8 };
const linkBtnStyle: React.CSSProperties = { background: "none", border: "none", padding: 0, color: "var(--ink-soft)", fontSize: "0.78rem", fontWeight: 600, textDecoration: "underline", cursor: "pointer" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
