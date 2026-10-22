"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCandidate, deleteEmployee, hireCandidate, importFromCrew, setCandidateStage } from "./actions";
import { CANDIDATE_STAGES, today } from "@/lib/hr";
import { btn, dangerBtn, grid2, input, label, primaryBtn } from "./hr-styles";

export function StageSelect({ id, stage, locked }: { id: string; stage: string; locked: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  if (locked) return <span style={{ fontSize: "0.85rem" }}>Hired</span>;
  return (
    <span>
      <select
        value={stage}
        onChange={async (e) => {
          setError("");
          const res = await setCandidateStage(id, e.target.value);
          if (res.error) setError(res.error);
          else router.refresh();
        }}
        style={{ ...input, width: "auto", padding: "5px 8px" }}
      >
        {CANDIDATE_STAGES.filter((s) => s.value !== "hired").map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {error && <div style={{ color: "var(--danger)", fontSize: "0.76rem" }}>{error}</div>}
    </span>
  );
}

// Turns a candidate into an employee. If no negative pre-employment test is on
// file the button warns and needs a deliberate second click.
export function HirePanel({ candidateId, position, cleared }: { candidateId: string; position: string | null; cleared: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [override, setOverride] = useState(false);

  async function submit(fd: FormData) {
    setError("");
    setBusy(true);
    try {
      const res = await hireCandidate(candidateId, {
        hireDate: String(fd.get("hireDate") || ""),
        position: String(fd.get("position") || ""),
        override,
      });
      if (res.error) {
        setError(res.error);
        if (!cleared) setOverride(false);
        return;
      }
      router.push(`/hr/employees/${res.id}`);
    } catch {
      setError("Couldn't complete the hire. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit}>
      <div style={grid2}>
        <div>
          <label style={label}>Hire date</label>
          <input name="hireDate" type="date" defaultValue={today()} style={input} />
        </div>
        <div>
          <label style={label}>Position</label>
          <input name="position" defaultValue={position ?? ""} style={input} />
        </div>
      </div>
      {cleared ? (
        <p style={{ color: "var(--active)", fontSize: "0.82rem", margin: "10px 0" }}>Negative pre-employment test on file. They will be enrolled in the testing program.</p>
      ) : (
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.82rem", margin: "10px 0", color: "var(--danger)" }}>
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} style={{ marginTop: 3 }} />
          No negative pre-employment test is on file. Hire anyway (they stay &ldquo;pending&rdquo; in the testing program until one is recorded).
        </label>
      )}
      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 8 }}>{error}</p>}
      <button type="submit" disabled={busy || (!cleared && !override)} style={{ ...primaryBtn, opacity: busy || (!cleared && !override) ? 0.5 : 1 }}>
        {busy ? "Hiring…" : "Hire and create employee record"}
      </button>
    </form>
  );
}

export function DeleteRecord({ kind, id }: { kind: "candidate" | "employee"; id: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <span>
      <button
        onClick={async () => {
          const what = kind === "candidate" ? "this candidate and their test records" : "this employee and all their testing and OQ history";
          if (!confirm(`Permanently delete ${what}?`)) return;
          const res = kind === "candidate" ? await deleteCandidate(id) : await deleteEmployee(id);
          if (res.error) setError(res.error);
          else router.push(kind === "candidate" ? "/hr/candidates" : "/hr/employees");
        }}
        style={dangerBtn}
      >
        Delete {kind}
      </button>
      {error && <span style={{ color: "var(--danger)", fontSize: "0.8rem", marginLeft: 10 }}>{error}</span>}
    </span>
  );
}

// Starts a company's roster from the crew names it already uses for daily logs.
export function ImportCrew({ companies }: { companies: { id: string; name: string }[] }) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} style={{ ...input, width: "auto", padding: "7px 8px" }}>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          const res = await importFromCrew(companyId);
          setBusy(false);
          setMessage(res.error ?? `${res.added} name${res.added === 1 ? "" : "s"} added.`);
          router.refresh();
        }}
        style={btn}
      >
        {busy ? "Importing…" : "Import names from daily-log crew list"}
      </button>
      {message && <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>{message}</span>}
    </span>
  );
}
