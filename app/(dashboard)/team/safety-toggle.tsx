"use client";

import { useState, useTransition } from "react";
import { setSafety } from "./actions";

export default function SafetyToggle({ userId, isSafety }: { userId: string; isSafety: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle() {
    setError("");
    startTransition(async () => {
      try {
        await setSafety(userId, !isSafety);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update safety coordinator access.");
      }
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {error && <span style={{ color: "var(--danger)", fontSize: "0.76rem" }}>{error}</span>}
      {isSafety && (
        <span
          style={{
            background: "var(--upcoming-bg)",
            color: "var(--upcoming)",
            borderRadius: 20,
            padding: "3px 10px",
            fontSize: "0.72rem",
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          Safety
        </span>
      )}
      <button
        onClick={toggle}
        disabled={pending}
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          color: "var(--ink)",
          borderRadius: 6,
          padding: "6px 12px",
          fontSize: "0.78rem",
          fontWeight: 600,
          cursor: pending ? "not-allowed" : "pointer",
        }}
      >
        {pending ? "…" : isSafety ? "Remove Safety" : "Make Safety Coordinator"}
      </button>
    </div>
  );
}
