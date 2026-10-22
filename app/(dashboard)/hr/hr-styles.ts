import type { CSSProperties } from "react";

export const card: CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20 };
export const input: CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.88rem", color: "var(--ink)", fontFamily: "inherit", width: "100%" };
export const label: CSSProperties = { display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 };
export const btn: CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "7px 14px", borderRadius: 6, fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" };
export const primaryBtn: CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
export const dangerBtn: CSSProperties = { ...btn, color: "var(--danger)" };
export const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 };
export const th: CSSProperties = { textAlign: "left", fontSize: "0.7rem", textTransform: "uppercase", color: "var(--muted)", padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
export const td: CSSProperties = { padding: "10px", borderBottom: "1px solid var(--border)", fontSize: "0.86rem", verticalAlign: "top" };

export type Tone = "good" | "warn" | "bad" | "muted";

export function chip(tone: Tone): CSSProperties {
  const colors: Record<Tone, [string, string]> = {
    good: ["var(--active-bg)", "var(--active)"],
    warn: ["var(--shop-bg)", "var(--shop)"],
    bad: ["var(--danger-bg)", "var(--danger)"],
    muted: ["var(--surface-2)", "var(--ink-soft)"],
  };
  const [bg, fg] = colors[tone];
  return { background: bg, color: fg, borderRadius: 20, padding: "2px 10px", fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap", display: "inline-block" };
}
