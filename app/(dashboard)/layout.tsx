import Link from "next/link";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipmentTickets } from "@/lib/db/schema";
import { canSeeEquipment, canSeeHR, isSafetyViewer } from "@/lib/auth/current-user";
import { getWorkspace } from "@/lib/auth/company";
import SignOutButton from "./sign-out-button";
import CompanySwitcher from "./company-switcher";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const current = await getWorkspace();
  // Proxy already guarantees a session reaches here; this is a safety net.
  if (!current) return null;

  // Signed in but not yet assigned to a company: nothing to show until an admin does that.
  if (!current.active) {
    return (
      <main style={{ maxWidth: 520, margin: "80px auto", padding: 28, textAlign: "center" }}>
        <h1 style={{ fontSize: "1.4rem", textTransform: "uppercase", marginBottom: 12 }}>White Board</h1>
        <p style={{ marginBottom: 8 }}>
          Welcome, {current.profile.name}. Your account hasn&apos;t been given access to a company yet.
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: 20 }}>
          Ask an admin to add you on the Team page, then refresh this page.
        </p>
        <SignOutButton />
      </main>
    );
  }

  const company = current.active;
  const safetyOnly = isSafetyViewer(current.profile);
  const showEquipment = canSeeEquipment(current.profile);
  let openTickets = 0;
  let downTickets = 0;
  if (showEquipment) {
    const rows = await db
      .select({ urgency: equipmentTickets.urgency })
      .from(equipmentTickets)
      .where(and(ne(equipmentTickets.status, "resolved"), eq(equipmentTickets.companyId, company.id)));
    openTickets = rows.length;
    downTickets = rows.filter((r) => r.urgency === "down").length;
  }

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
              {current.profile.name} · {safetyOnly ? "safety (view only)" : current.profile.role}
            </p>
          </div>
          <nav style={{ display: "flex", gap: 4 }}>
            <Link href="/board" style={navLinkStyle}>
              Board
            </Link>
            <Link href="/calendar" style={navLinkStyle}>
              Calendar
            </Link>
            {!safetyOnly && (
              <Link href="/opportunities" style={navLinkStyle}>
                Opportunities
              </Link>
            )}
            <Link href="/completed" style={navLinkStyle}>
              Completed
            </Link>
            <Link href="/oq" style={navLinkStyle}>
              OQ Practice
            </Link>
            {canSeeHR(current.profile) && (
              <Link href="/hr" style={navLinkStyle}>
                HR
              </Link>
            )}
            {showEquipment && (
              <Link href="/equipment" style={navLinkStyle}>
                Equipment
                {openTickets > 0 && (
                  <span
                    style={{
                      marginLeft: 8,
                      background: downTickets > 0 ? "var(--danger)" : "var(--rust)",
                      color: "#fff",
                      borderRadius: 20,
                      padding: "1px 8px",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                    }}
                    title={downTickets > 0 ? `${downTickets} down, ${openTickets} open` : `${openTickets} open`}
                  >
                    {openTickets}
                  </span>
                )}
              </Link>
            )}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CompanySwitcher
            companies={current.companies.map((c) => ({ id: c.id, name: c.name, shortName: c.shortName }))}
            activeId={company.id}
          />
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
