"use client";

import { useEffect, useState } from "react";

// A section card with a clickable header: click the title to fold the card down to
// one line (title + summary) or open it again. Each viewer's choice is remembered
// per section in this browser. The body is hidden, not removed, so a half-filled
// form or an in-progress upload survives folding the card up.
export default function CollapsibleCard({
  storageKey,
  title,
  subtitle,
  summary,
  actions,
  defaultOpen = true,
  padding = 20,
  marginTop = 0,
  marginBottom = 0,
  relative = false,
  children,
}: {
  storageKey: string;
  title: string;
  // Small muted line under the title (shown whenever the card is open).
  subtitle?: React.ReactNode;
  // Shown on the right of the title; always visible, so it doubles as the folded-up view.
  summary?: React.ReactNode;
  // Buttons such as "+ Add Entry"; shown only while the card is open.
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  padding?: string | number;
  marginTop?: number;
  marginBottom?: number;
  relative?: boolean;
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
    <div style={{ position: relative ? "relative" : undefined, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding, marginTop, marginBottom }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          title={open ? "Click to shorten" : "Click to expand"}
          style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, flexWrap: "wrap", background: "none", border: "none", padding: 0, margin: 0, color: "inherit", font: "inherit", textAlign: "left", cursor: "pointer" }}
        >
          <span aria-hidden style={{ color: "var(--muted)", fontSize: "0.8rem", width: 12, display: "inline-block", flexShrink: 0 }}>
            {open ? "▾" : "▸"}
          </span>
          <span>
            <span style={{ display: "block", fontSize: "1.02rem", fontWeight: 700, textTransform: "uppercase", fontFamily: "var(--font-display)" }}>{title}</span>
            {subtitle && open && <span style={{ display: "block", fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>{subtitle}</span>}
          </span>
          {summary && <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: "0.78rem" }}>{summary}</span>}
        </button>
        {open && actions}
      </div>
      <div style={{ display: open ? "block" : "none", marginTop: 12 }}>{children}</div>
    </div>
  );
}
