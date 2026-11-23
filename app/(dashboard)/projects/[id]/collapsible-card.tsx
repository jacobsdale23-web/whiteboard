"use client";

import { useEffect, useState } from "react";

// A section card whose header is a button: click it to fold the card down to one
// line (title + summary) or open it again. Each viewer's choice is remembered
// per section in this browser, so a long section stays out of the way.
export default function CollapsibleCard({
  storageKey,
  title,
  summary,
  defaultOpen = true,
  padding = "18px 20px",
  marginBottom = 0,
  children,
}: {
  storageKey: string;
  title: React.ReactNode;
  // Shown on the right of the header; always visible, handy as the folded-up view.
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  padding?: string | number;
  marginBottom?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`wb-card-${storageKey}`);
      if (saved === "open") setOpen(true);
      else if (saved === "closed") setOpen(false);
    } catch {
      // storage can be blocked; the default stands
    }
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(`wb-card-${storageKey}`, next ? "open" : "closed");
    } catch {
      // not remembered, still works
    }
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding, marginBottom }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={open ? "Click to shorten" : "Click to expand"}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          width: "100%",
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          color: "inherit",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden style={{ color: "var(--muted)", fontSize: "0.8rem", width: 12, display: "inline-block" }}>
            {open ? "▾" : "▸"}
          </span>
          {title}
        </span>
        {summary && <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{summary}</span>}
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}
