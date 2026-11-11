import type { ReactNode } from "react";

// Shared shell for the public privacy / terms pages (no sign-in needed; Intuit and other services link to these).
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 720, margin: "6vh auto", padding: 24, lineHeight: 1.55 }}>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", textTransform: "uppercase" }}>White Board · Feliciana Welders</p>
      <h1 style={{ fontSize: "1.7rem", margin: "4px 0 4px" }}>{title}</h1>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 24 }}>Last updated {updated}</p>
      {children}
      <p style={{ marginTop: 32, fontSize: "0.85rem", color: "var(--muted)" }}>
        <a href="/privacy" style={{ textDecoration: "underline" }}>Privacy policy</a> ·{" "}
        <a href="/terms" style={{ textDecoration: "underline" }}>Terms of use</a>
      </p>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: "1.1rem", marginBottom: 6 }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, color: "var(--ink-soft)" }}>{children}</div>
    </section>
  );
}

export { CONTACT_EMAIL } from "@/lib/contact";
