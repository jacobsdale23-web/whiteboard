import { db } from "@/lib/db";
import { hrEmployees, oqInvites } from "@/lib/db/schema";
import { requireHrPage } from "@/lib/hr-access";
import { getSiteUrl, smtpConfigured } from "@/lib/mail";
import { inviteLink, inviteState } from "@/lib/oq-invites";
import InvitesPanel, { type PersonRow, type OtherInvite } from "./invites-panel";
import { input } from "../hr-styles";

export const maxDuration = 120;

export default async function OqInvitesPage({ searchParams }: { searchParams: Promise<{ company?: string; q?: string; need?: string }> }) {
  const ws = await requireHrPage();
  const { company = "", q = "", need = "" } = await searchParams;

  const [employees, invites, siteUrl] = await Promise.all([db.select().from(hrEmployees), db.select().from(oqInvites), getSiteUrl()]);
  const coName = new Map(ws.allCompanies.map((c) => [c.id, c.shortName]));
  const needle = q.trim().toLowerCase();

  const toInvite = (i: (typeof invites)[number]) => ({
    id: i.id,
    link: inviteLink(siteUrl, i.token),
    revoked: inviteState(i) === "revoked",
    sentAt: i.sentAt ? i.sentAt.toISOString() : null,
    lastUsedAt: i.lastUsedAt ? i.lastUsedAt.toISOString() : null,
    useCount: i.useCount,
  });

  const rows: PersonRow[] = employees
    .filter((e) => e.status !== "terminated")
    .filter((e) => (!company || e.companyId === company) && (!needle || `${e.name} ${e.position ?? ""}`.toLowerCase().includes(needle)))
    .map((e) => {
      const mine = invites.filter((i) => i.employeeId === e.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const live = mine.find((i) => inviteState(i) === "active") ?? mine[0];
      return { id: e.id, name: e.name, company: coName.get(e.companyId) ?? e.companyId, position: e.position, email: (e.personalEmail || e.email || "").trim() || null, invite: live ? toInvite(live) : null };
    })
    .filter((r) => (need === "1" ? !r.invite || r.invite.revoked : true))
    .sort((a, b) => a.name.localeCompare(b.name));

  const others: OtherInvite[] = invites
    .filter((i) => !i.employeeId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((i) => ({ name: i.name, email: i.email, isGroup: i.isGroup, company: coName.get(i.companyId) ?? i.companyId, ...toInvite(i) }));

  return (
    <div>
      <p style={{ color: "var(--muted)", fontSize: "0.88rem", marginBottom: 14, maxWidth: 760 }}>
        Each person gets a personal link that opens <strong>only</strong> the OQ practice tests. No account, password or company email needed, and nothing else in White Board is reachable from it.
        A link works until you revoke it.
      </p>

      <form style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <input name="q" defaultValue={q} placeholder="Search name or position" style={{ ...input, width: 200 }} />
        <select name="company" defaultValue={company} style={{ ...input, width: "auto" }}>
          <option value="">All companies</option>
          {ws.allCompanies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="need" defaultValue={need} style={{ ...input, width: "auto" }}>
          <option value="">Everyone</option>
          <option value="1">Only people without a working link</option>
        </select>
        <button type="submit" style={{ ...input, width: "auto", cursor: "pointer", fontWeight: 600 }}>
          Filter
        </button>
      </form>

      <InvitesPanel rows={rows} others={others} companies={ws.allCompanies.map((c) => ({ id: c.id, name: c.name }))} defaultCompanyId={company || ws.active?.id || "fwi"} emailReady={smtpConfigured()} />
    </div>
  );
}
