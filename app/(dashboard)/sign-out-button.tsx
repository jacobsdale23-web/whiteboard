"use client";

import { signOutAction } from "./actions";

export default function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "8px 14px",
          fontSize: "0.85rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Sign Out
      </button>
    </form>
  );
}
