import Link from "next/link";
import { requireHrPage } from "@/lib/hr-access";

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  await requireHrPage();
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
        <h2>HR</h2>
        <nav style={{ display: "flex", gap: 6 }}>
          {[
            ["/hr", "Overview"],
            ["/hr/candidates", "Candidates"],
            ["/hr/employees", "Employees"],
          ].map(([href, text]) => (
            <Link key={href} href={href} style={{ padding: "7px 14px", borderRadius: 6, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}>
              {text}
            </Link>
          ))}
        </nav>
      </div>
      <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginBottom: 18 }}>
        Confidential. Visible only to admins and HR. One combined list across all four companies.
      </p>
      {children}
    </section>
  );
}
