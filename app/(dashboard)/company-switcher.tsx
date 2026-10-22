"use client";

type Option = { id: string; name: string; shortName: string };

// Picks which company's White Board is on screen. Only shown to people who
// can open more than one; everyone else just sees their company's name.
export default function CompanySwitcher({ companies, activeId }: { companies: Option[]; activeId: string }) {
  if (companies.length < 2) {
    return <span style={labelStyle}>{companies[0]?.name}</span>;
  }
  return (
    <select
      aria-label="Company"
      value={activeId}
      onChange={(e) => {
        window.location.href = `/switch-company?to=${encodeURIComponent(e.target.value)}&next=/board`;
      }}
      style={{
        background: "rgba(255,255,255,0.08)",
        color: "var(--steel-ink)",
        border: "1px solid rgba(255,255,255,0.3)",
        borderRadius: 6,
        padding: "7px 10px",
        fontSize: "0.85rem",
        fontWeight: 700,
        fontFamily: "inherit",
        cursor: "pointer",
      }}
    >
      {companies.map((c) => (
        <option key={c.id} value={c.id} style={{ color: "#111" }}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

const labelStyle: React.CSSProperties = { fontSize: "0.85rem", fontWeight: 700, color: "var(--steel-ink)" };
