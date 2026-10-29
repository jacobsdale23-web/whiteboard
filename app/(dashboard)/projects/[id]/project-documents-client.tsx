"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PROJECT_FILE_KINDS, PROJECT_FILE_TYPES, MAX_PROJECT_FILE_MB } from "@/lib/project-files";
import { requestProjectFileUpload, confirmProjectFileUpload, deleteProjectFile, getProjectFileDownloadUrl } from "./project-file-actions";

type ProjectFile = { id: string; kind: string; filename: string; fileSize: number; uploadedAt: string };

const ACCEPT = Object.keys(PROJECT_FILE_TYPES).map((e) => `.${e}`).join(",");

export default function ProjectDocumentsClient({ projectId, files }: { projectId: string; files: ProjectFile[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [kind, setKind] = useState(files.length ? "Contract" : "Original bid");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(formData: FormData) {
    setError("");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("Choose a file first.");
      return;
    }
    if (file.size > MAX_PROJECT_FILE_MB * 1024 * 1024) {
      setError(`That file is over ${MAX_PROJECT_FILE_MB} MB.`);
      return;
    }

    setUploading(true);
    try {
      const requested = await requestProjectFileUpload(projectId, file.name, kind);
      if (requested.error || !requested.uploadUrl || !requested.id || !requested.storageKey || !requested.contentType) {
        setError(requested.error || "Couldn't start the upload.");
        return;
      }
      const put = await fetch(requested.uploadUrl, { method: "PUT", headers: { "Content-Type": requested.contentType }, body: file });
      if (!put.ok) {
        setError("The upload to storage failed. Please try again.");
        return;
      }
      const confirmed = await confirmProjectFileUpload(projectId, { id: requested.id, kind, filename: file.name, storageKey: requested.storageKey, fileSize: file.size });
      if (confirmed.error) setError(confirmed.error);
      else {
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    } catch {
      setError("Something went wrong with that upload. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(id: string) {
    try {
      window.open(await getProjectFileDownloadUrl(projectId, id), "_blank");
    } catch {
      setError("Couldn't open that file.");
    }
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Contract &amp; Bid Documents</h3>
          <p style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>The original bid, contract and change orders. PDF, Word, Excel or an image, up to {MAX_PROJECT_FILE_MB} MB.</p>
        </div>
        <form action={handleUpload} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle} aria-label="Kind of document">
            {PROJECT_FILE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input ref={inputRef} type="file" name="file" accept={ACCEPT} required style={{ fontSize: "0.82rem", maxWidth: 230 }} />
          <button type="submit" disabled={uploading} style={primaryBtnStyle}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 10 }}>{error}</p>}

      {files.length ? (
        files.map((f) => (
          <div key={f.id} style={rowStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: "0.87rem", wordBreak: "break-word" }}>
                <span style={chipStyle}>{f.kind}</span>
                {f.filename}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
                {(f.fileSize / 1024 / 1024).toFixed(2)} MB · {new Date(f.uploadedAt).toLocaleDateString()}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={() => handleDownload(f.id)} style={secondaryBtnStyle}>
                Download
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete ${f.filename}? This cannot be undone.`)) startTransition(() => deleteProjectFile(projectId, f.id));
                }}
                style={deleteBtnStyle}
                aria-label={`Delete ${f.filename}`}
              >
                🗑
              </button>
            </div>
          </div>
        ))
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Nothing uploaded yet.</p>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginTop: 20 };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 9px", fontSize: "0.82rem", color: "var(--ink)", fontFamily: "inherit" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "7px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.82rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
const chipStyle: React.CSSProperties = { marginRight: 8, background: "var(--surface-2)", color: "var(--ink-soft)", fontSize: "0.66rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase" };
