"use client";

import { useState, useTransition } from "react";
import { setRole } from "./actions";

export default function RoleToggle({ userId, role, isSelf }: { userId: string; role: string; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const isAdmin = role === "admin";
  const disabled = pending || (isSelf && isAdmin);

  function toggle() {
    setError("");
    startTransition(async () => {
      try {
        await setRole(userId, isAdmin ? "member" : "admin");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update role.");
      }
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {error && <span style={{ color: "var(--danger)", fontSize: "0.76rem" }}>{error}</span>}
      <span
        style={{
          background: isAdmin ? "var(--active-bg)" : "var(--surface-2)",
          color: isAdmin ? "var(--active)" : "var(--ink-soft)",
          borderRadius: 20,
          padding: "3px 10px",
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        {isAdmin ? "Admin" : "Member"}
      </span>
      <button
        onClick={toggle}
        disabled={disabled}
        title={isSelf && isAdmin ? "You can't remove your own admin access" : ""}
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: disabled ? "var(--muted)" : "var(--ink)",
          borderRadius: 6,
          padding: "6px 12px",
          fontSize: "0.78rem",
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {pending ? "…" : isAdmin ? "Make Member" : "Make Admin"}
      </button>
    </div>
  );
}
