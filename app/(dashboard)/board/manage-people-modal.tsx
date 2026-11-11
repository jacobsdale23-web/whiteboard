"use client";

import { useState, useTransition } from "react";
import { addForeman, addPm, removeForeman, removePm, renamePm, type PeopleResult } from "./people-actions";

type Person = { id: string; name: string };

// Admin-only dialog on the board: the pool of project managers, and the foremen list.
export default function ManagePeopleModal({ pms, foremen }: { pms: Person[]; foremen: Person[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} style={secondaryBtnStyle} title="Add or change project managers and foremen">
        PMs &amp; Foremen
      </button>
      {open && (
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ textTransform: "uppercase" }}>PMs &amp; Foremen</h2>
              <button onClick={() => setOpen(false)} style={secondaryBtnStyle}>
                Done
              </button>
            </div>
            <List
              title="Project managers"
              hint="Pick one on any job. Removing a name only takes it off the list; jobs that already have that PM keep it. Renaming changes it on every job."
              people={pms}
              placeholder="New PM's name"
              onAdd={addPm}
              onRemove={removePm}
              onRename={renamePm}
            />
            <List
              title="Foremen"
              hint="Foremen show on the board, in The Shop, and in the crew list on a job. Typing someone already on the crew list makes them a foreman. Removing one hides them; their past logs keep the name."
              people={foremen}
              placeholder="New foreman's name"
              onAdd={addForeman}
              onRemove={removeForeman}
            />
          </div>
        </div>
      )}
    </>
  );
}

function List({
  title,
  hint,
  people,
  placeholder,
  onAdd,
  onRemove,
  onRename,
}: {
  title: string;
  hint: string;
  people: Person[];
  placeholder: string;
  onAdd: (name: string) => Promise<PeopleResult>;
  onRemove: (id: string) => Promise<PeopleResult>;
  onRename?: (id: string, name: string) => Promise<PeopleResult>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  function run(fn: () => Promise<PeopleResult>, after?: () => void) {
    setError("");
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else after?.();
    });
  }

  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: "0.95rem", marginBottom: 2 }}>{title}</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.76rem", marginBottom: 8 }}>{hint}</p>
      <div style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
        {people.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderBottom: "1px solid var(--border)" }}>
            {renaming?.id === p.id ? (
              <>
                <input value={renaming.value} onChange={(e) => setRenaming({ id: p.id, value: e.target.value })} style={{ ...inputStyle, flex: 1 }} autoFocus />
                <button disabled={pending} onClick={() => run(() => onRename!(p.id, renaming.value), () => setRenaming(null))} style={smallBtnStyle}>
                  Save
                </button>
                <button onClick={() => setRenaming(null)} style={smallBtnStyle}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span style={{ flex: 1 }}>{p.name}</span>
                {removing === p.id ? (
                  <>
                    <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Remove?</span>
                    <button disabled={pending} onClick={() => run(() => onRemove(p.id), () => setRemoving(null))} style={smallBtnStyle}>
                      Yes
                    </button>
                    <button onClick={() => setRemoving(null)} style={smallBtnStyle}>
                      No
                    </button>
                  </>
                ) : (
                  <>
                    {onRename && (
                      <button onClick={() => setRenaming({ id: p.id, value: p.name })} style={smallBtnStyle}>
                        Rename
                      </button>
                    )}
                    <button onClick={() => setRemoving(p.id)} style={smallBtnStyle}>
                      Remove
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
        {!people.length && <div style={{ padding: "8px 10px", color: "var(--muted)", fontSize: "0.85rem" }}>No one yet.</div>}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(() => onAdd(name), () => setName(""));
        }}
        style={{ display: "flex", gap: 8, marginTop: 8 }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={60} style={{ ...inputStyle, flex: 1 }} />
        <button type="submit" disabled={pending || !name.trim()} style={primaryBtnStyle}>
          Add
        </button>
      </form>
      {error && <p style={{ color: "var(--danger)", fontSize: "0.82rem", marginTop: 6 }}>{error}</p>}
    </section>
  );
}

const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(20,18,15,0.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px", overflowY: "auto", zIndex: 50 };
const modalStyle: React.CSSProperties = { background: "var(--surface)", borderRadius: 12, width: "100%", maxWidth: 480, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.35)", border: "1px solid var(--border)" };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.9rem", color: "var(--ink)", fontFamily: "inherit" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const smallBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: "0.78rem" };
