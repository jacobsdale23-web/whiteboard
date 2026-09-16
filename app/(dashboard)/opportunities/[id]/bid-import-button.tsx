"use client";

import { useRef, useState } from "react";
import { requestBidImportUpload, splitBidImportFile, extractBidImportChunk, saveBidImportItems } from "./bid-import-actions";

export default function BidImportButton({ opportunityId }: { opportunityId: string }) {
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleImport(formData: FormData) {
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) {
      setMessage({ type: "error", text: "Choose a PDF file first." });
      return;
    }
    if (
      !confirm(
        "Extract line items from this PDF with Claude? This uses paid API usage — typically well under $1 for a short form, a few dollars for a long multi-page rate schedule."
      )
    )
      return;

    setMessage(null);
    setImporting(true);
    try {
      const uploaded = await requestBidImportUpload(opportunityId, file.name);
      if (uploaded.error || !uploaded.uploadUrl || !uploaded.storageKey) {
        setMessage({ type: "error", text: uploaded.error || "Couldn't start the upload." });
        return;
      }

      const putResult = await fetch(uploaded.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!putResult.ok) {
        setMessage({ type: "error", text: "Upload to storage failed. Please try again." });
        return;
      }

      const split = await splitBidImportFile(opportunityId, uploaded.storageKey, file.name);
      if (split.error || !split.chunks) {
        setMessage({ type: "error", text: split.error || "Couldn't process that PDF." });
        return;
      }

      // One server action call per chunk so each chunk's Claude call gets
      // its own Vercel execution window. allSettled (not all) because a
      // chunk can still fail at the network/infra level (e.g. a timeout on
      // an unusually dense chunk) -- that must not wipe out the other
      // chunks' already-extracted items along with it.
      const settled = await Promise.allSettled(
        split.chunks.map((c) => extractBidImportChunk(c.storageKey, c.filename))
      );
      const outcomes = settled.map((s, i) =>
        s.status === "fulfilled"
          ? s.value
          : { filename: split.chunks![i].filename, error: s.reason instanceof Error ? s.reason.message : "Extraction timed out or failed." }
      );

      const succeeded = outcomes.filter((o) => o.result);
      if (!succeeded.length) {
        setMessage({ type: "error", text: outcomes.map((o) => `${o.filename}: ${o.error}`).join(" | ") });
        return;
      }

      const items = succeeded.flatMap((o) => o.result!.items);
      const notes = succeeded.map((o) => o.result!.notes).filter(Boolean);
      const failures = outcomes.filter((o) => o.error).map((o) => `${o.filename} could not be processed (${o.error}).`);

      const saved = await saveBidImportItems(opportunityId, items);
      if (saved.error) {
        setMessage({ type: "error", text: saved.error });
        return;
      }

      const noteText = [...notes, ...failures].join(" ");
      setMessage({
        type: failures.length ? "error" : "success",
        text: `Imported ${saved.imported} item${saved.imported === 1 ? "" : "s"}.${noteText ? ` Note: ${noteText}` : ""}`,
      });
      formRef.current?.reset();
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
