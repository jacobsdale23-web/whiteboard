"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addQbJobToWhiteBoard, createJobInQuickBooks, type CheckResult } from "./actions";

type QbJob = { id: string; number: string; name: string; parent: string | null; active: boolean; isProject: boolean | null };
type WbRow = { id: string; name: string; number: string | null; customer: string | null; status: string };
type Data = { matched: number; qbOnly: QbJob[]; wbNotInQb: WbRow[]; wbNoNumber: WbRow[]; nameDiffs: { number: string; wb: string; qb: string }[] };

export default function CheckView({ check, qbCount, next }: { check: Data; qbCount: number; next: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<string | null>(null);

  function run(fn: () => Promise<CheckResult>) {
    setMessage("");
    setError("");
    setConfirming(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
    });
  }

  const inSync = !check.qbOnly.length && !check.wbNotInQb.length && !check.wbNoNumber.length;

  return (
    <div>
      <p style={{ fontSize: "0.9rem", marginBottom: 14 }}>
        {check.matched} jobs match by number · QuickBooks has {qbCount} numbered jobs · the next free number is <strong style={{ fontFamily: "var(--font-mono)" }}>{next}</strong>.{" "}
        {inSync && <strong>In sync.</strong>}
      </p>
      {message && <p style={{ ...noteStyle, borderColor: "var(--active)" }}>{message}</p>}
      {error && <p style={{ ...noteStyle, borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</p>}

      <Block title={`In QuickBooks, not in White Board (${check.qbOnly.length})`} empty="Nothing missing from White Board." hint="This year's numbered jobs only. The field may already be clocking into these.">
        {check.qbOnly.map((j) => (
          <Row key={j.id} left={<><Num n={j.number} /> {j.name}{j.parent ? <Sub> · {j.parent}</Sub> : null}{j.isProject === true && <Sub> · Project</Sub>}</>}>
            <button disabled={pending} onClick={() => run(() => addQbJobToWhiteBoard(j.id))} style={btnStyle}>
              Add to White Board
            </button>
          </Row>
        ))}
      </Block>

      <Block title={`In White Board, no number yet (${check.wbNoNumber.length})`} empty="Every open job has a number." hint="Creating the job in QuickBooks gives it the next number and writes the number back here. It is a real change in your books.">
        {check.wbNoNumber.map((p) => (
          <Row key={p.id} left={<><Link href={`/projects/${p.id}`} style={{ textDecoration: "underline" }}>{p.name}</Link>{p.customer ? <Sub> · {p.customer}</Sub> : <Sub> · no customer</Sub>} <Sub>· {p.status}</Sub></>}>
            {p.customer ? (
              <CreateButton id={p.id} next={`about ${next}`} confirming={confirming} setConfirming={setConfirming} pending={pending} onGo={() => run(() => createJobInQuickBooks(p.id))} name={p.name} customer={p.customer} />
            ) : (
              <Link href={`/projects/${p.id}`} style={{ color: "var(--muted)", fontSize: "0.78rem", textDecoration: "underline" }}>
                Set the customer first
              </Link>
            )}
          </Row>
        ))}
      </Block>

      <Block title={`In White Board, number not in QuickBooks (${check.wbNotInQb.length})`} empty="Every numbered job exists in QuickBooks." hint="Likely a typo, or a job not yet created in QuickBooks. Creating it uses the job's own number.">
        {check.wbNotInQb.map((p) => (
          <Row key={p.id} left={<><Num n={p.number || ""} /> <Link href={`/projects/${p.id}`} style={{ textDecoration: "underline" }}>{p.name}</Link>{p.customer ? <Sub> · {p.customer}</Sub> : null} <Sub>· {p.status}</Sub></>}>
            <CreateButton id={p.id} next={p.number || ""} confirming={confirming} setConfirming={setConfirming} pending={pending} onGo={() => run(() => createJobInQuickBooks(p.id))} name={p.name} customer={p.customer} />
          </Row>
        ))}
      </Block>

      {check.nameDiffs.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: 8 }}>Same number, different name ({check.nameDiffs.length}) — for information, often just wording</summary>
          <Block title="" hint="" empty="">
            {check.nameDiffs.map((d, i) => (
              <Row key={`${d.number}-${i}`} left={<><Num n={d.number} /> White Board: {d.wb} <Sub>· QuickBooks: {d.qb}</Sub></>} />
            ))}
          </Block>
        </details>
      )}
    </div>
  );
}

function CreateButton({ id, next, confirming, setConfirming, pending, onGo, name, customer }: { id: string; next: string; confirming: string | null; setConfirming: (s: string | null) => void; pending: boolean; onGo: () => void; name: string; customer: string | null }) {
  if (confirming !== id) {
    return (
      <button disabled={pending} onClick={() => setConfirming(id)} style={btnStyle}>
        Create in QuickBooks
      </button>
    );
  }
  return (
    <div style={{ flexBasis: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: "0.84rem" }}>
      Create <strong>{next} - {name}</strong> in QuickBooks under <strong>{customer || "(no customer)"}</strong>? This is a real change in your books. Afterwards, check that it shows on QuickBooks&apos; Projects page.
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button disabled={pending} onClick={onGo} style={{ ...btnStyle, background: "var(--rust)", color: "var(--rust-ink)" }}>
          {pending ? "Creating…" : "Yes, create it"}
        </button>
        <button onClick={() => setConfirming(null)} style={btnStyle}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Block({ title, hint, empty, children }: { title: string; hint: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  const none = items.length === 0;
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: "1rem", marginBottom: 2 }}>{title}</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginBottom: 8 }}>{hint}</p>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "2px 14px" }}>
        {none ? <p style={{ color: "var(--muted)", fontSize: "0.85rem", padding: "10px 0" }}>{empty}</p> : children}
      </div>
    </section>
  );
}

function Row({ left, children }: { left: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: "0.9rem" }}>
      <div style={{ minWidth: 0 }}>{left}</div>
      {children}
    </div>
  );
}

const Num = ({ n }: { n: string }) => <span style={{ fontFamily: "var(--font-mono)", color: "var(--muted)" }}>{n} ·</span>;
const Sub = ({ children }: { children: React.ReactNode }) => <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{children}</span>;
const btnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "7px 12px", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem" };
const noteStyle: React.CSSProperties = { border: "1px solid var(--border)", borderLeftWidth: 4, borderRadius: 8, padding: "10px 12px", fontSize: "0.88rem", marginBottom: 14 };
