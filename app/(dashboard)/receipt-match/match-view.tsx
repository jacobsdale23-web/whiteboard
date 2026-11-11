"use client";

import { useState, useTransition } from "react";
import { codeAllReady, codeChargeToJob, confirmMatch, runMatchNow, unmatchReceipt, type MatchResultMsg } from "./actions";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

type Suggestion = {
  receiptId: string;
  txnId: string;
  confidence: "high" | "possible";
  auto: boolean;
  note: string;
  days: number;
  receipt: { vendor: string | null; amount: number; date: string | null; project: string; by: string };
  charge: { vendor: string; memo: string; amount: number; date: string; coded: boolean };
};
type Matched = { receiptId: string; vendor: string | null; amount: number; date: string | null; project: string; coded: boolean; chargeDate: string | null; chargeCoded: boolean };
type Charge = { id: string; vendor: string; memo: string; amount: number; date: string; coded: boolean };
type Rcpt = { id: string; vendor: string | null; amount: number; date: string | null; project: string; by: string };

export default function MatchView({
  cardName,
  chargeCount,
  chargeTotal,
  alreadyMatched,
  suggestions,
  matched,
  chargesWithoutReceipt,
  receiptsWithoutCharge,
  autoCodeOn,
}: {
  cardName: string;
  chargeCount: number;
  chargeTotal: number;
  alreadyMatched: number;
  suggestions: Suggestion[];
  matched: Matched[];
  chargesWithoutReceipt: Charge[];
  receiptsWithoutCharge: Rcpt[];
  autoCodeOn: boolean;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [confirmingAll, setConfirmingAll] = useState(false);

  function run(fn: () => Promise<MatchResultMsg>) {
    setMessage("");
    setError("");
    setConfirmingAll(false);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else if (res.message) setMessage(res.message);
    });
  }

  const ready = matched.filter((m) => !m.coded);
  const codedCount = matched.length - ready.length;

  return (
    <div>
      <p style={{ fontSize: "0.9rem", marginBottom: 6 }}>
        <strong>{cardName}</strong>: {chargeCount} charges booked in this window ({money(chargeTotal)}). {alreadyMatched} receipts already matched, {codedCount} of them coded to their jobs.
      </p>
      <p style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: 12 }}>
        Every day White Board matches clear pairs on its own (same amount, vendor agrees, no other possibility).{" "}
        {autoCodeOn ? "Automatic coding to jobs in QuickBooks is ON." : "Automatic coding to jobs in QuickBooks is OFF: matched charges wait below until you code them."}
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button disabled={pending} onClick={() => run(runMatchNow)} style={btnStyle}>
          {pending ? "Working…" : "Run matching now"}
        </button>
      </div>
      {message && <p style={{ ...noteStyle, borderColor: "var(--active)" }}>{message}</p>}
      {error && <p style={{ ...noteStyle, borderColor: "var(--danger)", color: "var(--danger)" }}>{error}</p>}

      <Block title={`Matched, not coded to a job yet (${ready.length})`} hint="Coding puts the receipt's job on the card charge in QuickBooks, so the cost lands on the job. It is a real change in your books; the amount, account and vendor are never touched." empty="Nothing waiting.">
        {ready.length > 0 && (
          <div style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            {confirmingAll ? (
              <div style={{ fontSize: "0.84rem" }}>
                Code {ready.length} charges to their jobs in QuickBooks? Charges with more than one line, or already coded to another customer, are skipped and listed.
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button disabled={pending} onClick={() => run(codeAllReady)} style={{ ...btnStyle, background: "var(--rust)", color: "var(--rust-ink)" }}>
                    Yes, code them
                  </button>
                  <button onClick={() => setConfirmingAll(false)} style={btnStyle}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button disabled={pending} onClick={() => setConfirmingAll(true)} style={btnStyle}>
                Code all {ready.length} to their jobs
              </button>
            )}
          </div>
        )}
        {ready.map((m) => (
          <Row key={m.receiptId} left={<>{m.vendor || "Receipt"} · {money(m.amount)} <Sub>· {m.date} · {m.project}{m.chargeCoded ? " · charge already has a job in QuickBooks" : ""}</Sub></>}>
            <button disabled={pending} onClick={() => run(() => codeChargeToJob(m.receiptId))} style={btnStyle}>
              Code to job
            </button>
            <button disabled={pending} onClick={() => run(() => unmatchReceipt(m.receiptId))} style={btnStyle}>
              Unmatch
            </button>
          </Row>
        ))}
      </Block>

      <Block title={`Needs your eye (${suggestions.length})`} hint="Suggested pairs. 'Will match on its own' ones are clear and get matched on the next run; the rest are less certain (a tip, an unfamiliar vendor name, or two look-alikes)." empty="No pairs to review.">
        {suggestions.map((s) => (
          <Row
            key={s.receiptId}
            left={
              <>
                <div>
                  <strong>{s.receipt.vendor || "Receipt"}</strong> {money(s.receipt.amount)} <Sub>· {s.receipt.date} · {s.receipt.project} · {s.receipt.by}</Sub>
                </div>
                <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                  → charge {s.charge.date}: {s.charge.vendor || s.charge.memo || "(no vendor)"} {money(s.charge.amount)} · {s.note}
                  {s.auto ? " · will match on its own" : ""}
                </div>
              </>
            }
          >
            <button disabled={pending} onClick={() => run(() => confirmMatch(s.receiptId, s.txnId))} style={btnStyle}>
              Confirm match
            </button>
          </Row>
        ))}
      </Block>

      <Block title={`Charges with no receipt (${chargesWithoutReceipt.length})`} hint="Card charges in QuickBooks that no scanned receipt matches yet: a foreman still owes the receipt, it hasn't been scanned, or the amount differs." empty="Every charge has a receipt.">
        {chargesWithoutReceipt.map((c) => (
          <Row key={c.id} left={<>{c.vendor || c.memo || "(no vendor)"} · {money(c.amount)} <Sub>· {c.date}{c.coded ? " · already has a job in QuickBooks" : ""}</Sub></>} />
        ))}
      </Block>

      <Block title={`Receipts with no charge yet (${receiptsWithoutCharge.length})`} hint="Scanned receipts whose charge hasn't shown up in QuickBooks yet (cards can take days to post), or that were paid another way." empty="Every receipt has its charge.">
        {receiptsWithoutCharge.map((r) => (
          <Row key={r.id} left={<>{r.vendor || "Receipt"} · {money(r.amount)} <Sub>· {r.date} · {r.project} · {r.by}</Sub></>} />
        ))}
      </Block>
    </div>
  );
}

function Block({ title, hint, empty, children }: { title: string; hint: string; empty: string; children: React.ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <section style={{ marginBottom: 22 }}>
      <h3 style={{ fontSize: "1rem", marginBottom: 2 }}>{title}</h3>
      <p style={{ color: "var(--muted)", fontSize: "0.78rem", marginBottom: 8 }}>{hint}</p>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "2px 14px" }}>
        {items.length ? children : <p style={{ color: "var(--muted)", fontSize: "0.85rem", padding: "10px 0" }}>{empty}</p>}
      </div>
    </section>
  );
}

function Row({ left, children }: { left: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)", fontSize: "0.9rem" }}>
      <div style={{ minWidth: 0 }}>{left}</div>
      {children && <div style={{ display: "flex", gap: 6 }}>{children}</div>}
    </div>
  );
}

const Sub = ({ children }: { children: React.ReactNode }) => <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>{children}</span>;
const btnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "7px 12px", fontWeight: 600, cursor: "pointer", fontSize: "0.8rem" };
const noteStyle: React.CSSProperties = { border: "1px solid var(--border)", borderLeftWidth: 4, borderRadius: 8, padding: "10px 12px", fontSize: "0.88rem", marginBottom: 14 };
