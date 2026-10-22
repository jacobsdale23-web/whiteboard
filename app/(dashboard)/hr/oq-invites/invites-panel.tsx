"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGroupInvite, createInvites, createManualInvite, deleteInvite, resendInvite, restoreInvite, revokeInvite } from "../oq-actions";
import { btn, card, chip, dangerBtn, grid2, input, label, primaryBtn, td, th } from "../hr-styles";

export type InviteInfo = { id: string; link: string; revoked: boolean; sentAt: string | null; lastUsedAt: string | null; useCount: number };
export type PersonRow = { id: string; name: string; company: string; position: string | null; email: string | null; invite: InviteInfo | null };
export type OtherInvite = InviteInfo & { name: string; email: string | null; company: string; isGroup: boolean };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }) : null);

function mailto(name: string, email: string, link: string) {
  const subject = "Your OQ practice tests";
  const body = `Hi ${name.trim().split(/\s+/)[0]},\n\nHere is your personal link to the OQ practice tests. Open it on your phone or tablet:\n\n${link}\n\nThere is no account or password. Save or bookmark the link; it keeps working. It's just for you, so please don't share it.\n`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function InvitesPanel({
  rows,
  others,
  companies,
  defaultCompanyId,
  emailReady,
}: {
  rows: PersonRow[];
  others: OtherInvite[];
  companies: { id: string; name: string }[];
  defaultCompanyId: string;
  emailReady: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const allSelected = rows.length > 0 && selected.length === rows.length;

  async function run<T>(fn: () => Promise<T>, after?: (r: T) => void) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const r = await fn();
      after?.(r);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function summarize(r: { error?: string; created?: number; reused?: number; sent?: number; noEmail?: string[]; failed?: { name: string; error: string }[] }) {
    if (r.error) return setError(r.error);
    const parts = [`${r.created ?? 0} link${r.created === 1 ? "" : "s"} created`];
    if (r.reused) parts.push(`${r.reused} already had one`);
    if (r.sent) parts.push(`${r.sent} emailed`);
    setMessage(parts.join(", ") + ".");
    if (r.noEmail?.length) setError(`No email on file for: ${r.noEmail.join(", ")}. Copy their link instead.`);
    if (r.failed?.length) setError((e) => (e ? e + " " : "") + `Couldn't email: ${r.failed!.map((f) => `${f.name} (${f.error})`).join("; ")}`);
    setSelected([]);
  }

  async function copy(link: string, id: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? "" : c)), 2000);
    } catch {
      window.prompt("Copy this link:", link);
    }
  }

  function linkActions(inv: InviteInfo, name: string, email: string | null) {
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {!inv.revoked && (
          <>
            <button onClick={() => copy(inv.link, inv.id)} style={btn}>
              {copied === inv.id ? "Copied" : "Copy link"}
            </button>
            {email &&
              (emailReady ? (
                <button disabled={busy} onClick={() => run(() => resendInvite(inv.id), (r) => (r.error ? setError(r.error) : setMessage(`Emailed ${name}.`)))} style={btn}>
                  {inv.sentAt ? "Resend email" : "Email"}
                </button>
              ) : (
                <a href={mailto(name, email, inv.link)} style={{ ...btn, textDecoration: "none" }}>
                  Open in email app
                </a>
              ))}
            <button disabled={busy} onClick={() => confirm(`Turn off ${name}'s link? It stops working immediately.`) && run(() => revokeInvite(inv.id))} style={dangerBtn}>
              Revoke
            </button>
          </>
        )}
        {inv.revoked && (
          <>
            <button disabled={busy} onClick={() => run(() => restoreInvite(inv.id))} style={btn}>
              Restore
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {!emailReady && (
        <p style={{ background: "var(--shop-bg)", color: "var(--shop)", borderRadius: 8, padding: "10px 14px", fontSize: "0.84rem", marginBottom: 14 }}>
          Sending email straight from White Board isn&apos;t turned on yet (it needs the same Outlook setup as the weekly JSA email). Until then, copy a link and text it, or use &ldquo;Open in email app&rdquo; to send it from your own mailbox.
        </p>
      )}

      {(message || error) && (
        <div style={{ marginBottom: 12 }}>
          {message && <p style={{ color: "var(--active)", fontSize: "0.88rem" }}>{message}</p>}
          {error && <p style={{ color: "var(--danger)", fontSize: "0.88rem" }}>{error}</p>}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{selected.length} selected</span>
        <button disabled={busy || !selected.length} onClick={() => run(() => createInvites(selected, { send: false }), summarize)} style={{ ...btn, opacity: selected.length ? 1 : 0.5 }}>
          Create links
        </button>
        <button disabled={busy || !selected.length || !emailReady} onClick={() => run(() => createInvites(selected, { send: true }), summarize)} style={{ ...primaryBtn, opacity: selected.length && emailReady ? 1 : 0.5 }} title={emailReady ? "" : "Email isn't set up yet"}>
          {busy ? "Working…" : "Create links and email them"}
        </button>
      </div>

      <div style={{ ...card, padding: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>
                <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : rows.map((r) => r.id))} aria-label="Select all" />
              </th>
              <th style={th}>Employee</th>
              <th style={th}>Email on file</th>
              <th style={th}>Link</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={td}>
                  <input type="checkbox" checked={selected.includes(r.id)} onChange={() => setSelected((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} aria-label={`Select ${r.name}`} />
                </td>
                <td style={td}>
                  <strong>{r.name}</strong>
                  <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
                    {r.company}
                    {r.position ? ` · ${r.position}` : ""}
                  </div>
                </td>
                <td style={td}>{r.email || <span style={{ color: "var(--muted)" }}>none</span>}</td>
                <td style={td}>
                  {!r.invite ? (
                    <span style={chip("muted")}>No link yet</span>
                  ) : r.invite.revoked ? (
                    <span style={chip("bad")}>Revoked</span>
                  ) : (
                    <>
                      <span style={chip("good")}>Active</span>
                      <div style={{ color: "var(--muted)", fontSize: "0.74rem", marginTop: 3 }}>
                        {r.invite.sentAt ? `Emailed ${when(r.invite.sentAt)}` : "Not emailed"}
                        {" · "}
                        {r.invite.lastUsedAt ? `Opened ${r.invite.useCount}× (last ${when(r.invite.lastUsedAt)})` : "Never opened"}
                      </div>
                    </>
                  )}
                </td>
                <td style={td}>{r.invite && linkActions(r.invite, r.name, r.email)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} style={{ ...td, color: "var(--muted)" }}>
                  No employees match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <GroupLink companies={companies} defaultCompanyId={defaultCompanyId} busy={busy} run={run} summarize={summarize} />

      <AddSomeoneElse companies={companies} defaultCompanyId={defaultCompanyId} emailReady={emailReady} busy={busy} run={run} summarize={summarize} />

      {others.length > 0 && (
        <div style={{ ...card, padding: 12, overflowX: "auto" }}>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", margin: "6px 6px 10px" }}>Group links and other invites</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {others.map((o) => (
                <tr key={o.id}>
                  <td style={td}>
                    <strong>{o.name}</strong> {o.isGroup && <span style={chip("warn")}>Group link</span>}
                    <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>
                      {o.company}
                      {o.email ? ` · ${o.email}` : ""}
                    </div>
                  </td>
                  <td style={td}>
                    <span style={chip(o.revoked ? "bad" : "good")}>{o.revoked ? "Revoked" : "Active"}</span>
                    <div style={{ color: "var(--muted)", fontSize: "0.74rem", marginTop: 3 }}>{o.lastUsedAt ? `Opened ${o.useCount}× (last ${when(o.lastUsedAt)})` : "Never opened"}</div>
                  </td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {linkActions(o, o.name, o.email)}
                      <button disabled={busy} onClick={() => confirm(`Delete ${o.name}'s invite?`) && run(() => deleteInvite(o.id))} style={dangerBtn}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// One link for a whole class: hand the same link to everyone in the room.
function GroupLink({
  companies,
  defaultCompanyId,
  busy,
  run,
  summarize,
}: {
  companies: { id: string; name: string }[];
  defaultCompanyId: string;
  busy: boolean;
  run: <T>(fn: () => Promise<T>, after?: (r: T) => void) => Promise<void>;
  summarize: (r: { error?: string; created?: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <p style={{ margin: "20px 0 10px" }}>
        <button onClick={() => setOpen(true)} style={primaryBtn}>
          + Create a group link (one link for a whole class)
        </button>
      </p>
    );
  return (
    <form
      action={(fd) =>
        run(
          () => createGroupInvite({ name: String(fd.get("name") || ""), companyId: String(fd.get("companyId") || "") }),
          (r) => {
            summarize(r);
            if (!r.error) setOpen(false);
          }
        )
      }
      style={{ ...card, marginTop: 20 }}
    >
      <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 6 }}>Group link</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginBottom: 12 }}>
        One link that everyone in the class can use, on their own phones. Anyone who has it can open the practice tests, so revoke it when the session is over. You&apos;ll find it under &ldquo;Group links and other invites&rdquo; below.
      </p>
      <div style={grid2}>
        <div>
          <label style={label}>Name (for your reference)</label>
          <input name="name" required placeholder="e.g. Tuesday OQ class" style={input} />
        </div>
        <div>
          <label style={label}>Company</label>
          <select name="companyId" defaultValue={defaultCompanyId} style={input}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button type="submit" disabled={busy} style={primaryBtn}>
          Create group link
        </button>
        <button type="button" onClick={() => setOpen(false)} style={btn}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddSomeoneElse({
  companies,
  defaultCompanyId,
  emailReady,
  busy,
  run,
  summarize,
}: {
  companies: { id: string; name: string }[];
  defaultCompanyId: string;
  emailReady: boolean;
  busy: boolean;
  run: <T>(fn: () => Promise<T>, after?: (r: T) => void) => Promise<void>;
  summarize: (r: { error?: string; created?: number; sent?: number; failed?: { name: string; error: string }[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <p style={{ marginBottom: 20 }}>
        <button onClick={() => setOpen(true)} style={btn}>
          + Invite someone who isn&apos;t on the roster
        </button>
      </p>
    );

  const submit = (fd: FormData, send: boolean) =>
    run(
      () =>
        createManualInvite({
          name: String(fd.get("name") || ""),
          email: String(fd.get("email") || ""),
          companyId: String(fd.get("companyId") || ""),
          send,
        }),
      (r) => {
        summarize(r);
        if (!r.error) setOpen(false);
      }
    );

  return (
    <form action={(fd) => submit(fd, false)} style={{ ...card, marginTop: 20 }}>
      <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 10 }}>Invite someone who isn&apos;t on the roster</h3>
      <div style={grid2}>
        <div>
          <label style={label}>Name</label>
          <input name="name" required style={input} />
        </div>
        <div>
          <label style={label}>Email (optional)</label>
          <input name="email" type="email" style={input} />
        </div>
        <div>
          <label style={label}>Company</label>
          <select name="companyId" defaultValue={defaultCompanyId} style={input}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button type="submit" disabled={busy} style={btn}>
          Create link
        </button>
        <button
          type="button"
          disabled={busy || !emailReady}
          onClick={(e) => submit(new FormData(e.currentTarget.form!), true)}
          style={{ ...primaryBtn, opacity: emailReady ? 1 : 0.5 }}
          title={emailReady ? "" : "Email isn't set up yet"}
        >
          Create link and email it
        </button>
        <button type="button" onClick={() => setOpen(false)} style={btn}>
          Cancel
        </button>
      </div>
    </form>
  );
}
