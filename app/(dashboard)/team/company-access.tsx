"use client";

import { useState, useTransition } from "react";
import { setAllCompanies, setCompanyAccess } from "./actions";

type Company = { id: string; shortName: string };

// Which companies a person can open. Checkboxes are limited to the companies
// the signed-in admin can open; the "All companies" switch is for all-company admins.
export default function CompanyAccess({
  userId,
  companies,
  memberOf,
  allCompanies,
  canSetAll,
}: {
  userId: string;
  companies: Company[];
  memberOf: string[];
  allCompanies: boolean;
  canSetAll: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function run(fn: () => Promise<void>) {
    setError("");
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update company access.");
      }
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {error && <span style={{ color: "var(--danger)", fontSize: "0.76rem" }}>{error}</span>}
      {allCompanies ? (
        <span style={chipOn}>All companies</span>
      ) : (
        companies.map((c) => {
          const on = memberOf.includes(c.id);
          return (
            <label key={c.id} style={on ? chipOn : chipOff}>
              <input type="checkbox" checked={on} disabled={pending} onChange={() => run(() => setCompanyAccess(userId, c.id, !on))} style={{ marginRight: 5 }} />
              {c.shortName}
            </label>
          );
        })
      )}
      {canSetAll && (
        <button onClick={() => run(() => setAllCompanies(userId, !allCompanies))} disabled={pending} style={btn}>
          {pending ? "…" : allCompanies ? "Limit companies" : "All companies"}
        </button>
      )}
    </div>
  );
}

const chipBase: React.CSSProperties = { borderRadius: 20, padding: "3px 10px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center" };
const chipOn: React.CSSProperties = { ...chipBase, background: "var(--upcoming-bg)", color: "var(--upcoming)" };
const chipOff: React.CSSProperties = { ...chipBase, background: "var(--surface-2)", color: "var(--muted)" };
const btn: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", borderRadius: 6, padding: "6px 12px", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" };
