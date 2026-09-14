import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import RoleToggle from "./role-toggle";

export default async function TeamPage() {
  const current = await getSessionAndProfile();
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

  const allProfiles = await db.select().from(profiles);
  const sorted = allProfiles.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section>
      <h2 style={{ marginBottom: 8 }}>Team</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 18 }}>
        Admins can see and manage Budget data (pay applications, expenses, invoices) on every project. Members —
        field crew — cannot. Only people who have signed in at least once appear here.
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
            <RoleToggle userId={p.id} role={p.role} isSelf={p.id === current.profile.id} />
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
