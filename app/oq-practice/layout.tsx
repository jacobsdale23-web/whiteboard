import type { Metadata } from "next";

// Personal practice-test links: keep them out of search engines and don't leak
// the link (which is the credential) in a Referer header.
export const metadata: Metadata = {
  title: "OQ Practice Tests",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header style={{ background: "var(--steel-2)", color: "var(--steel-ink)", padding: "16px 20px" }}>
        <h1 style={{ fontSize: "1.2rem", textTransform: "uppercase" }}>OQ Practice Tests</h1>
      </header>
      <main style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>{children}</main>
    </div>
  );
}
