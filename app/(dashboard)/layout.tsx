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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/team"
            title="Account"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "var(--steel-ink)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "0.8rem",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            {initials(current.profile.name)}
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 28 }}>{children}</main>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[1][0] : "";
  return (a + b).toUpperCase();
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
