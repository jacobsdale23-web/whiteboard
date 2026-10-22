import { db } from "@/lib/db";
import { profileCompanies, profiles } from "@/lib/db/schema";
import { getWorkspace } from "@/lib/auth/company";
import CompanyAccess from "./company-access";
import RoleToggle from "./role-toggle";
import MechanicToggle from "./mechanic-toggle";
import SafetyToggle from "./safety-toggle";
import HrToggle from "./hr-toggle";

export default async function TeamPage() {
  const current = await getWorkspace();
  if (!current) return null;

  if (current.profile.role !== "admin") {
    return (
      <section>
        <h2 style={{ marginBottom: 16 }}>Your Account</h2>
        <div style={cardStyle}>
          <Fact label="Name" value={current.profile.name} />
          <Fact label="Email" value={current.profile.email} />
          <Fact label="Role" value="Member" />
        </div>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 16 }}>
          Only admins can see Budget/financial data and manage the team. Ask an admin if you need access.
        </p>
      </section>
    );
  }

  const [allProfiles, allMemberships] = await Promise.all([db.select().from(profiles), db.select().from(profileCompanies)]);
  const membershipsBy = new Map<string, string[]>();
  for (const m of allMemberships) membershipsBy.set(m.profileId, [...(membershipsBy.get(m.profileId) || []), m.companyId]);
  // All-company admins see everyone; other admins see their own companies' people
  // plus anyone who has signed in but hasn't been assigned to a company yet.
  const mine = new Set(current.companies.map((c) => c.id));
  const sorted = allProfiles
    .filter((p) => {
      if (current.profile.allCompanies || p.allCompanies) return true;
      const theirs = membershipsBy.get(p.id) || [];
      return !theirs.length || theirs.some((id) => mine.has(id));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section>
      <h2 style={{ marginBottom: 8 }}>Team</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 18 }}>
        Admins can see and manage Budget data (pay applications, expenses, invoices) on every project. Members —
        field crew — cannot. Mechanics can see the Equipment tickets page (admins always can). A Safety Coordinator
        gets a view-only account (projects, calendar, daily logs, JSAs, OQ practice) and receives the weekly JSA
        email. HR users (like admins) can open the confidential HR module. The company chips decide which companies&apos; White Boards a person can open; new sign-ins see
        nothing until you tick a company for them. Only people who have
        signed in at least once appear here.
      </p>
      <div style={cardStyle}>
        {sorted.map((p) => (
          <div key={p.id} style={rowStyle}>
            <div>
              <div style={{ fontWeight: 600 }}>
                {p.name} {p.id === current.profile.id && <span style={{ color: "var(--muted)", fontWeight: 400 }}>(you)</span>}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{p.email}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <CompanyAccess
                userId={p.id}
                companies={current.companies.map((c) => ({ id: c.id, shortName: c.shortName }))}
                memberOf={membershipsBy.get(p.id) || []}
                allCompanies={p.allCompanies}
                canSetAll={current.profile.allCompanies}
              />
              <MechanicToggle userId={p.id} isMechanic={p.isMechanic} />
              {p.role !== "admin" && <HrToggle userId={p.id} isHR={p.isHR} />}
              {p.role !== "admin" && <SafetyToggle userId={p.id} isSafety={p.isSafety} />}
              <RoleToggle userId={p.id} role={p.role} isSelf={p.id === current.profile.id} />
            </div>
          </div>
        ))}
        {!sorted.length && <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No one has signed in yet.</p>}
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontWeight: 600, marginTop: 3 }}>{value}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" };
