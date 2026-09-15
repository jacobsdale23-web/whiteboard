"use client";

import { useRef, useState, useTransition } from "react";
import { requestPlanFileUpload, confirmPlanFileUpload, deletePlanFile, getPlanFileDownloadUrl } from "./plan-files-actions";

type PlanFile = { id: string; filename: string; fileSize: string; uploadedAt: Date };

export default function PlanFilesSection({ opportunityId, files }: { opportunityId: string; files: PlanFile[] }) {
  const [, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(formData: FormData) {
    setError("");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("Choose a PDF file first.");
      return;
    }

    setUploading(true);
    try {
      const requested = await requestPlanFileUpload(opportunityId, file.name);
      if (requested.error || !requested.uploadUrl || !requested.id || !requested.storageKey) {
        setError(requested.error || "Couldn't start the upload.");
        return;
      }

      const putResult = await fetch(requested.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!putResult.ok) {
        setError("Upload to storage failed. Please try again.");
        return;
      }

      const confirmed = await confirmPlanFileUpload(opportunityId, {
        id: requested.id,
        filename: file.name,
        storageKey: requested.storageKey,
        fileSize: file.size,
      });
      if (confirmed.error) {
        setError(confirmed.error);
      } else if (inputRef.current) {
        inputRef.current.value = "";
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(id: string) {
    const url = await getPlanFileDownloadUrl(opportunityId, id);
    window.open(url, "_blank");
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Plans &amp; Specs</h3>
          <p style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>PDF only</p>
        </div>
        <form
          action={handleUpload}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input ref={inputRef} type="file" name="file" accept="application/pdf" required style={{ fontSize: "0.82rem" }} />
          <button type="submit" disabled={uploading} style={primaryBtnStyle}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 10 }}>{error}</p>}

      {files.length ? (
        files.map((f) => (
          <div key={f.id} style={rowStyle}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.87rem" }}>{f.filename}</div>
              <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
                {(Number(f.fileSize) / 1024 / 1024).toFixed(2)} MB · {new Date(f.uploadedAt).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => handleDownload(f.id)} style={secondaryBtnStyle}>
                Download
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete ${f.filename}?`)) startTransition(() => deletePlanFile(opportunityId, f.id));
                }}
                style={deleteBtnStyle}
              >
                🗑
              </button>
            </div>
          </div>
        ))
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No plans or specs uploaded yet.</p>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
