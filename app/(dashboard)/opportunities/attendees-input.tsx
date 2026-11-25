"use client";

import { useId, useState } from "react";
import { cleanAttendees } from "@/lib/meeting";

// Who is coming to a meeting besides the organizer: pick a known name or type any other (customers, vendors), one at a time or separated by
// commas. The list is sent with the form as JSON, including a name still sitting in the box.
export default function AttendeesInput({ initial, suggestions, inputStyle }: { initial: string[]; suggestions: string[]; inputStyle: React.CSSProperties }) {
  const [names, setNames] = useState<string[]>(initial);
  const [typed, setTyped] = useState("");
  const listId = useId();
  const withTyped = cleanAttendees([...names, ...typed.split(",")]);

  function add() {
    setNames(withTyped);
    setTyped("");
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 }}>Additional attendees (optional)</div>
      <input type="hidden" name="attendees" value={JSON.stringify(withTyped)} />
      {!!names.length && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {names.map((n) => (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 20, padding: "4px 6px 4px 11px", fontSize: "0.85rem" }}>
              {n}
              <button type="button" onClick={() => setNames((l) => l.filter((x) => x !== n))} aria-label={`Remove ${n}`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: "1rem", lineHeight: 1, padding: "0 4px" }}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          list={listId}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the name instead of saving the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type a name, then Add"
          aria-label="Attendee name"
          autoComplete="off"
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        />
        <button type="button" onClick={add} disabled={!typed.trim()} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", borderRadius: 6, padding: "0 14px", fontWeight: 600, cursor: "pointer", opacity: typed.trim() ? 1 : 0.5 }}>
          Add
        </button>
      </div>
      <datalist id={listId}>
        {suggestions
          .filter((s) => !names.includes(s))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
