"use client";

import { useTransition } from "react";
import { deleteOpportunity } from "./actions";

export default function DeleteButton({ id, jobName }: { id: string; jobName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete "${jobName}"? This can't be undone.`)) {
          startTransition(() => deleteOpportunity(id));
        }
      }}
      title="Delete"
      style={{
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 5,
        width: 28,
        height: 28,
        cursor: "pointer",
        color: "var(--muted)",
      }}
    >
      🗑
    </button>
  );
}
