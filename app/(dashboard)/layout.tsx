import Link from "next/link";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import SignOutButton from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const current = await getSessionAndProfile();
  // Proxy already guarantees a session reaches here; this is a safety net.
  if (!current) return null;

  return (
    <div>
      <header
        style={{
          background: "var(--steel-2)",
          color: "var(--steel-ink)",
          padding: "18px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div>
            <h1 style={{ fontSize: "1.3rem", textTransform: "uppercase" }}>White Board</h1>
            <p style={{ fontSize: "0.8rem", color: "#b7c0cc" }}>
              {current.profile.name} · {current.profile.role}
            </p>
          </div>
          <nav style={{ display: "flex", gap: 4 }}>
            <Link href="/board" style={navLinkStyle}>
              Board
            </Link>
            <Link href="/calendar" style={navLinkStyle}>
              Calendar
            </Link>
            <Link href="/opportunities" style={navLinkStyle}>
              Opportunities
            </Link>
          </nav>
        </div>
        <SignOutButton />
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 28 }}>{children}</main>
    </div>
  );
}

const navLinkStyle: React.CSSProperties = {
  color: "var(--steel-ink)",
  textDecoration: "none",
  fontSize: "0.85rem",
  fontWeight: 600,
  padding: "8px 14px",
  borderRadius: 6,
  background: "rgba(255,255,255,0.08)",
};
