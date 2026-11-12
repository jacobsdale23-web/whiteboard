"use client";

import { useState } from "react";
import ScheduleForm from "./schedule-form";

export default function AddSchedule({ projects, names, defaultStart }: { projects: { id: string; name: string }[]; names: string[]; defaultStart: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" }}>
        + Schedule someone
      </button>
    );
  }
  return (
    <div style={{ flexBasis: "100%", maxWidth: 560 }}>
      <ScheduleForm projects={projects} names={names} defaultStart={defaultStart} onDone={() => setOpen(false)} />
    </div>
  );
}
