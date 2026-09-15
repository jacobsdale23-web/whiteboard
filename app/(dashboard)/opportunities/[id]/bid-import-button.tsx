"use client";

import { useRef, useState } from "react";
import { importBidItemsFromPdf } from "./bid-import-actions";

export default function BidImportButton({ opportunityId }: { opportunityId: string }) {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleImport(formData: FormData) {
    if (!confirm("Extract line items from this PDF with Claude? This uses paid API usage (typically well under $1 per import).")) return;
    setMessage(null);
    setImporting(true);
    try {
      const result = await importBidItemsFromPdf(opportunityId, formData);
      if (result.error) {
        setMessage({ type: "error", text: result.error });
      } else {
        setMessage({
          type: "success",
          text: `Imported ${result.imported} item${result.imported === 1 ? "" : "s"}.${result.notes ? ` Note: ${result.notes}` : ""}`,
        });
        formRef.current?.reset();
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <form ref={formRef} action={handleImport} style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input ref={inputRef} type="file" name="file" accept="application/pdf" required style={{ fontSize: "0.76rem", maxWidth: 150 }} />
        <button type="submit" disabled={importing} style={btnStyle}>
          {importing ? "Importing…" : "Import from PDF"}
        </button>
      </form>
      {message && (
        <p style={{ fontSize: "0.76rem", maxWidth: 320, textAlign: "right", color: message.type === "error" ? "var(--danger)" : "var(--active, #2e7d32)" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
