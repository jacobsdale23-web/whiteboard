import Link from "next/link";
import { db } from "@/lib/db";
import { hrCandidates, hrDrugTests } from "@/lib/db/schema";
import { requireHrPage } from "@/lib/hr-access";
import { OPEN_STAGES, PRE_EMPLOYMENT_LABEL, preEmploymentState, stageLabel, type PreEmploymentState } from "@/lib/hr";
import CandidateForm from "../candidate-form";
import { chip, input, td, th, type Tone } from "../hr-styles";

const PRE_TONE: Record<PreEmploymentState, Tone> = { not_ordered: "muted", pending: "warn", cleared: "good", failed: "bad", refused: "bad" };

export default async function CandidatesPage({ searchParams }: { searchParams: Promise<{ company?: string; show?: string; q?: string }> }) {
  const ws = await requireHrPage();
  const { company = "", show = "open", q = "" } = await searchParams;

  const [candidates, tests] = await Promise.all([db.select().from(hrCandidates), db.select().from(hrDrugTests)]);
  const companyName = new Map(ws.allCompanies.map((c) => [c.id, c.shortName]));
  const needle = q.trim().toLowerCase();
  const rows = candidates
    .filter((c) => (!company || c.companyId === company) && (show === "all" || OPEN_STAGES.includes(c.stage)) && (!needle || [c.name, c.position ?? "", c.email ?? "", c.phone ?? ""].some((s) => s.toLowerCase().includes(needle))))
    .sort((a, b) => (b.appliedDate ?? "").localeCompare(a.appliedDate ?? "") || b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input name="q" defaultValue={q} placeholder="Search name, position, phone" style={{ ...input, width: 220 }} />
          <select name="company" defaultValue={company} style={{ ...input, width: "auto" }}>
            <option value="">All companies</option>
            {ws.allCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select name="show" defaultValue={show} style={{ ...input, width: "auto" }}>
            <option value="open">Open candidates</option>
            <option value="all">Everyone (incl. hired / closed)</option>
          </select>
          <button type="submit" style={{ ...input, width: "auto", cursor: "pointer", fontWeight: 600 }}>
            Filter
          </button>
        </form>
        <CandidateForm companies={ws.allCompanies.map((c) => ({ id: c.id, name: c.name }))} defaultCompanyId={company || ws.active?.id || "fwi"} />
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Candidate</th>
              <th style={th}>Company</th>
              <th style={th}>Position</th>
              <th style={th}>Stage</th>
              <th style={th}>Pre-employment test</th>
              <th style={th}>Applied</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const state = preEmploymentState(tests.filter((t) => t.candidateId === c.id));
              return (
                <tr key={c.id}>
                  <td style={td}>
                    <Link href={`/hr/candidates/${c.id}`} style={{ fontWeight: 600, color: "inherit" }}>
                      {c.name}
                    </Link>
                    <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>{[c.phone, c.email].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td style={td}>{companyName.get(c.companyId) ?? c.companyId}</td>
                  <td style={td}>{c.position || "—"}</td>
                  <td style={td}>
                    <span style={chip(c.stage === "hired" ? "good" : OPEN_STAGES.includes(c.stage) ? "muted" : "bad")}>{stageLabel(c.stage)}</span>
                  </td>
                  <td style={td}>
                    <span style={chip(PRE_TONE[state])}>{PRE_EMPLOYMENT_LABEL[state]}</span>
                  </td>
                  <td style={td}>{c.appliedDate || "—"}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} style={{ ...td, color: "var(--muted)" }}>
                  No candidates match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
