"use client";

import { useState, useTransition } from "react";
import { POSITIONS } from "@/lib/positions";
import { RATE_SCHEDULES, type RateScheduleKey } from "@/lib/rate-schedules";
import {
  setBillingRate,
  applyRateSchedule,
  addBillingTask,
  deleteBillingTask,
  generateInvoice,
  approveInvoice,
  deleteTmInvoice,
  setInvoiceNumber,
  exportInvoiceExcel,
  rescreenInvoice,
  removeInvoiceLineItem,
  refreshInvoice,
  acknowledgeWarning,
  acknowledgeWarnings,
  unacknowledgeWarning,
} from "./billing-actions";
import { sendInvoiceToQuickBooks, disconnectQuickBooks } from "./quickbooks-actions";
import { openLater } from "@/lib/open-later";
import { qbInvoiceLink } from "@/lib/qb-invoice";

// Whether White Board can send invoices to this company's QuickBooks.
export type QbStatus = { configured: boolean; connected: boolean; companyName: string | null; realmId: string | null };
import { warningKey, warningKind } from "@/lib/tm-ack";

type BillingRate = { id: string; position: string; hourlyRate: string };
type BillingTask = {
  id: string;
  taskNumber: string;
  projectName: string | null;
  taskRequestNo: string | null;
  contractCoordinator: string | null;
  billToName: string | null;
  billToAddress: string | null;
};
type TmLineItem = {
  date: string;
  crewMember: string;
  position: string;
  leakNumber: string;
  locusviewNumber: string;
  address: string;
  hours: number;
  rate: number;
  amount: number;
};
type TmWarning = {
  severity: "error" | "warning";
  type: string;
  message: string;
  date: string;
  crewMember: string;
  cells?: { date: string; crewMember: string; field: string; value?: string }[];
};
type TmInvoice = {
  id: string;
  billingTaskId: string;
  invoiceNumber: string | null;
  periodStart: string;
  periodEnd: string;
  status: string;
  total: string;
  lineItems: TmLineItem[] | null;
  warnings: TmWarning[] | null;
  acknowledged: { key: string; note: string; at: string }[] | null;
  qbInvoiceId: string | null;
};

// Admin-only. Never render this component, or pass billing rates / invoice
// totals as props, for a non-admin session — field crew must only ever see
// position + hours on the Daily Log, never $/hr or computed amounts.
export default function BillingSection({
  projectId,
  billingRates,
  billingTasks,
  tmInvoices,
  qb,
}: {
  projectId: string;
  billingRates: BillingRate[];
  billingTasks: BillingTask[];
  tmInvoices: TmInvoice[];
  qb: QbStatus;
}) {
  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 4 }}>T&amp;M Billing</h3>
      <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 16 }}>
        🔒 Admin only — rates and invoice totals are never shown to field crew.
      </p>

      <RatesSubsection projectId={projectId} rates={billingRates} />
      <TasksSubsection projectId={projectId} tasks={billingTasks} />
      <InvoicesSubsection projectId={projectId} tasks={billingTasks} invoices={tmInvoices} qb={qb} />
    </div>
  );
}

function RatesSubsection({ projectId, rates }: { projectId: string; rates: BillingRate[] }) {
  const [, startTransition] = useTransition();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [newPosition, setNewPosition] = useState("");
  const [newRate, setNewRate] = useState("");
  const [error, setError] = useState("");
  const unset = POSITIONS.filter((p) => !rates.some((r) => r.position === p));

  function apply(key: RateScheduleKey) {
    const label = RATE_SCHEDULES[key].label;
    if (rates.length && !confirm(`Apply the ${label} rates? This overwrites this project's current rate for every position on that schedule.`)) return;
    setError("");
    startTransition(async () => {
      const res = await applyRateSchedule(projectId, key);
      if (res.error) setError(res.error);
    });
  }

  return (
    <SubSection title="Hourly Rates by Position">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: "0.76rem", color: "var(--muted)" }}>Fill in from the standard rate sheet:</span>
        <button onClick={() => apply("louisiana")} style={addBtnStyle}>
          Apply Louisiana rates
        </button>
        <button onClick={() => apply("jackson")} style={addBtnStyle}>
          Apply Jackson rates (Mississippi)
        </button>
        {error && <span style={{ color: "var(--danger)", fontSize: "0.78rem" }}>{error}</span>}
      </div>
      {rates.length ? (
        rates
          .slice()
          .sort((a, b) => a.position.localeCompare(b.position))
          .map((r) => {
            const value = edits[r.id] ?? r.hourlyRate;
            return (
              <div key={r.id} style={rowStyle}>
                <div style={{ fontSize: "0.87rem" }}>{r.position}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value}
                    onChange={(e) => setEdits((s) => ({ ...s, [r.id]: e.target.value }))}
                    style={{ ...inputStyle, width: 90 }}
                  />
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>/hr</span>
                  <button
                    onClick={() => {
                      const rate = Number(value) || 0;
                      startTransition(() => setBillingRate(projectId, r.position, rate));
                    }}
                    style={addBtnStyle}
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          })
      ) : (
        <Empty>No billing rates set for this project yet.</Empty>
      )}
      {unset.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 12 }}>
          <span style={{ fontSize: "0.76rem", color: "var(--muted)" }}>Add a position:</span>
          <select value={newPosition} onChange={(e) => setNewPosition(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
            <option value="">Choose…</option>
            {unset.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span style={{ fontFamily: "var(--font-mono)" }}>$</span>
          <input type="number" min="0" step="0.01" placeholder="Rate" value={newRate} onChange={(e) => setNewRate(e.target.value)} style={{ ...inputStyle, width: 90 }} />
          <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>/hr</span>
          <button
            disabled={!newPosition || !newRate}
            onClick={() => {
              const position = newPosition;
              const rate = Number(newRate) || 0;
              setNewPosition("");
              setNewRate("");
              startTransition(() => setBillingRate(projectId, position, rate));
            }}
            style={{ ...addBtnStyle, opacity: newPosition && newRate ? 1 : 0.5 }}
          >
            Add
          </button>
        </div>
      )}
    </SubSection>
  );
}

function TasksSubsection({ projectId, tasks }: { projectId: string; tasks: BillingTask[] }) {
  const [show, setShow] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <SubSection
      title="Recurring Task / PO Numbers"
      action={
        <button onClick={() => setShow((s) => !s)} style={addBtnStyle}>
          + Add Task Number
        </button>
      }
    >
      {show && (
        <form
          action={async (fd) => {
            await addBillingTask(projectId, fd);
            setShow(false);
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="text" name="taskNumber" placeholder="Task / PO Number" required style={{ ...inputStyle, flex: 1 }} />
            <input type="text" name="taskRequestNo" placeholder="Task Request No." style={{ ...inputStyle, flex: 1 }} />
          </div>
          <input type="text" name="projectName" placeholder="Project Name" style={inputStyle} />
          <input type="text" name="contractCoordinator" placeholder="Contract Coordinator" style={inputStyle} />
          <input type="text" name="billToName" placeholder="Bill To Name" style={inputStyle} />
          <textarea name="billToAddress" placeholder="Bill To Address" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={primaryBtnStyle}>
              Add
            </button>
            <button type="button" onClick={() => setShow(false)} style={secondaryBtnStyle}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {tasks.length ? (
        tasks.map((t) => (
          <div key={t.id} style={rowStyle}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.87rem" }}>{t.taskNumber}</div>
              <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>{t.projectName || "—"}</div>
            </div>
            <button
              onClick={() => {
                if (confirm(`Delete task ${t.taskNumber}? Existing invoices for it are kept.`)) {
                  startTransition(() => deleteBillingTask(projectId, t.id));
                }
              }}
              style={deleteBtnStyle}
            >
              🗑
            </button>
          </div>
        ))
      ) : (
        <Empty>No recurring task numbers set up yet.</Empty>
      )}
    </SubSection>
  );
}

function InvoicesSubsection({
  projectId,
  tasks,
  invoices,
  qb,
}: {
  projectId: string;
  tasks: BillingTask[];
  invoices: TmInvoice[];
  qb: QbStatus;
}) {
  const [showGen, setShowGen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <SubSection
      title="Weekly Invoices"
      action={
        <button onClick={() => setShowGen((s) => !s)} style={addBtnStyle} disabled={!tasks.length}>
          + Generate Invoice
        </button>
      }
    >
      {!tasks.length && <Empty>Add a task/PO number above before generating an invoice.</Empty>}
      {notice && <p style={{ color: "var(--ink-soft)", fontSize: "0.82rem", marginBottom: 10 }}>{notice}</p>}

      {showGen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const billingTaskId = String(fd.get("billingTaskId") || "");
            const periodStart = String(fd.get("periodStart") || "");
            const periodEnd = String(fd.get("periodEnd") || "");
            setError(null);
            setNotice(null);
            startTransition(async () => {
              try {
                const res = await generateInvoice(projectId, billingTaskId, periodStart, periodEnd);
                if ("error" in res) setError(res.error);
                else {
                  setShowGen(false);
                  if (res.refreshed) setNotice("That period already had a draft, so it was refreshed from the daily logs instead of making a copy.");
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "Couldn't generate that invoice.");
              }
            });
          }}
          style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14, border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}
        >
          <select name="billingTaskId" required style={inputStyle} defaultValue="">
            <option value="" disabled>
              — Select task / PO number —
            </option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.taskNumber} {t.projectName ? `— ${t.projectName}` : ""}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Field label="Period Start">
              <input type="date" name="periodStart" required style={inputStyle} />
            </Field>
            <Field label="Period End">
              <input type="date" name="periodEnd" required style={inputStyle} />
            </Field>
          </div>
          {error && <p style={{ color: "var(--danger, #c0392b)", fontSize: "0.82rem" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" style={primaryBtnStyle} disabled={pending}>
              {pending ? "Generating…" : "Generate Draft"}
            </button>
            <button type="button" onClick={() => setShowGen(false)} style={secondaryBtnStyle}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {invoices.length ? (
        invoices
          .slice()
          .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
          .map((inv) => <InvoiceCard key={inv.id} projectId={projectId} invoice={inv} tasks={tasks} qb={qb} />)
      ) : (
        <Empty>No invoices generated yet.</Empty>
      )}
    </SubSection>
  );
}

function InvoiceCard({ projectId, invoice, tasks, qb }: { projectId: string; invoice: TmInvoice; tasks: BillingTask[]; qb: QbStatus }) {
  const [expanded, setExpanded] = useState(false);
  const [msg, setMsg] = useState("");
  const [qbNote, setQbNote] = useState("");
  const [pending, startTransition] = useTransition();
  const task = tasks.find((t) => t.id === invoice.billingTaskId);
  // `warnings` is what is still open; flags marked "not a mistake" are kept apart in `settled`.
  const allWarnings = invoice.warnings || [];
  const acks = new Map((invoice.acknowledged || []).map((a) => [a.key, a]));
  const warnings = allWarnings.filter((w) => !acks.has(warningKey(w)));
  const settled = allWarnings.filter((w) => acks.has(warningKey(w)));
  const errorCount = warnings.filter((w) => w.severity === "error").length;
  const warningCount = warnings.length - errorCount;
  const isDraft = invoice.status === "draft";
  // Open flags of the same kind (same problem, different people or days), for "Mark all like this".
  const sameKind = (w: TmWarning) => warnings.filter((x) => warningKind(x) === warningKind(w));

  function run(action: () => Promise<{ error?: string } | void>) {
    setMsg("");
    startTransition(async () => {
      try {
        const res = (await action()) as { error?: string } | undefined;
        if (res && res.error) setMsg(res.error);
      } catch {
        setMsg("Something went wrong. Try again, and tell Jacob if it keeps happening.");
      }
    });
  }

  async function handleExport() {
    const { filename, base64 } = await exportInvoiceExcel(projectId, invoice.id);
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>
            {task?.taskNumber || "Unknown task"} · {invoice.periodStart} → {invoice.periodEnd}
          </div>
          <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
            <span
              style={{
                textTransform: "uppercase",
                fontWeight: 700,
                color: invoice.status === "approved" ? "var(--active, #2e7d32)" : "var(--muted)",
              }}
            >
              {invoice.status}
            </span>
            {invoice.invoiceNumber ? ` · Invoice #${invoice.invoiceNumber}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!!warnings.length && (
            <span style={{ ...flagBadgeStyle, background: errorCount ? "var(--danger-bg, #fdecea)" : "var(--surface-2)", color: errorCount ? "var(--danger, #c0392b)" : "var(--ink-soft)" }}>
              ⚠ {warnings.length} {warnings.length === 1 ? "issue" : "issues"}
            </span>
          )}
          {!warnings.length && !!settled.length && <span style={flagBadgeStyle}>✓ flags resolved</span>}
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>${Number(invoice.total).toLocaleString()}</span>
          <button onClick={() => setExpanded((s) => !s)} style={addBtnStyle}>
            {expanded ? "Hide" : "Review"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          {!!warnings.length && (
            <div style={{ border: "1px solid var(--danger, #c0392b)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, background: "var(--danger-bg, #fdecea)" }}>
              <div style={{ fontSize: "0.76rem", fontWeight: 700, textTransform: "uppercase", marginBottom: 6, color: "var(--danger, #c0392b)" }}>
                Screening found {errorCount ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : ""}
                {errorCount && warningCount ? " and " : ""}
                {warningCount ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : ""}
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.8rem", color: "var(--ink)" }}>
                {warnings.map((w, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {w.severity === "error" ? "🛑" : "⚠"} {w.message}
                    {isDraft && (
                      <button
                        disabled={pending}
                        onClick={() => {
                          const note = window.prompt("Why is this not a mistake? (optional note)", "");
                          if (note === null) return;
                          run(() => acknowledgeWarning(projectId, invoice.id, warningKey(w), note));
                        }}
                        style={{ ...addBtnStyle, marginLeft: 8, padding: "2px 8px", fontSize: "0.72rem" }}
                        title="This is correct as it is; stop flagging it"
                      >
                        Not a mistake
                      </button>
                    )}
                    {isDraft && sameKind(w).length > 1 && (
                      <button
                        disabled={pending}
                        onClick={() => {
                          const group = sameKind(w);
                          const note = window.prompt(`Mark all ${group.length} flags of this kind as not a mistake? Optional note:`, "");
                          if (note === null) return;
                          run(() => acknowledgeWarnings(projectId, invoice.id, group.map(warningKey), note));
                        }}
                        style={{ ...addBtnStyle, marginLeft: 6, padding: "2px 8px", fontSize: "0.72rem" }}
                        title="Settles every open flag of the same kind on this invoice (for example, all lines missing a Locusview number)"
                      >
                        Mark all {sameKind(w).length} like this
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {isDraft && (
                <div style={{ fontSize: "0.74rem", color: "var(--ink-soft)", marginTop: 6 }}>
                  Fix a real mistake in the Daily Logs, then press Refresh from daily logs. This invoice updates in place; no new copy is made.
                </div>
              )}
            </div>
          )}
          {!!settled.length && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", marginBottom: 12, background: "var(--surface-2)" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", marginBottom: 4, color: "var(--ink-soft)" }}>Marked not a mistake ({settled.length})</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.78rem", color: "var(--ink-soft)" }}>
                {settled.map((w, i) => {
                  const a = acks.get(warningKey(w));
                  return (
                    <li key={i} style={{ marginBottom: 3 }}>
                      ✓ {w.message}
                      {a?.note ? <em> — {a.note}</em> : null}
                      {isDraft && (
                        <button
                          disabled={pending}
                          onClick={() => run(() => unacknowledgeWarning(projectId, invoice.id, warningKey(w)))}
                          style={{ ...addBtnStyle, marginLeft: 8, padding: "1px 7px", fontSize: "0.7rem" }}
                        >
                          Undo
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {msg && <p style={{ color: "var(--danger, #c0392b)", fontSize: "0.82rem", marginBottom: 10 }}>{msg}</p>}
          {qbNote && <p style={{ color: "var(--ink-soft)", fontSize: "0.82rem", marginBottom: 10 }}>{qbNote}</p>}
          {!isDraft && qb.connected && (
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 8 }}>
              QuickBooks: {qb.companyName || "connected"} ·{" "}
              <button
                onClick={() => {
                  if (confirm("Disconnect QuickBooks from White Board? Invoices already sent stay in QuickBooks.")) startTransition(async () => {
                      await disconnectQuickBooks(projectId);
                    });
                }}
                style={{ background: "none", border: "none", padding: 0, color: "inherit", textDecoration: "underline", cursor: "pointer", fontSize: "inherit" }}
              >
                Disconnect
              </button>
            </p>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              type="text"
              defaultValue={invoice.invoiceNumber || ""}
              placeholder="Invoice #"
              onBlur={(e) => startTransition(() => setInvoiceNumber(projectId, invoice.id, e.target.value))}
              style={{ ...inputStyle, width: 140 }}
            />
            {isDraft && (
              <button
                onClick={() => run(() => refreshInvoice(projectId, invoice.id))}
                disabled={pending}
                style={secondaryBtnStyle}
                title="Rebuild this invoice from the current daily logs and rates, in place"
              >
                {pending ? "Working…" : "Refresh from daily logs"}
              </button>
            )}
            {isDraft && (
              <button
                onClick={() => run(() => approveInvoice(projectId, invoice.id))}
                disabled={pending || warnings.length > 0}
                style={{ ...primaryBtnStyle, opacity: warnings.length ? 0.5 : 1, cursor: warnings.length ? "not-allowed" : "pointer" }}
                title={warnings.length ? "Fix each flag in the daily logs and refresh, or mark it Not a mistake, first" : "Approve this invoice"}
              >
                Approve
              </button>
            )}
            {!isDraft && (
              <button onClick={() => startTransition(() => rescreenInvoice(projectId, invoice.id))} style={secondaryBtnStyle} title="Check this invoice again against the current daily logs">
                Re-screen
              </button>
            )}
            {!isDraft && invoice.qbInvoiceId && (
              <a href={qb.realmId ? qbInvoiceLink(qb.realmId, invoice.qbInvoiceId) : `https://qbo.intuit.com/app/invoice?txnId=${encodeURIComponent(invoice.qbInvoiceId)}`} target="_blank" rel="noreferrer" style={{ ...secondaryBtnStyle, textDecoration: "none", display: "inline-block" }}>
                ✓ In QuickBooks{invoice.invoiceNumber ? ` #${invoice.invoiceNumber}` : ""} ↗
              </a>
            )}
            {!isDraft && !invoice.qbInvoiceId && qb.connected && (
              <button
                disabled={pending}
                onClick={() => {
                  if (!confirm(`Create this invoice in QuickBooks${qb.companyName ? ` (${qb.companyName})` : ""} for $${Number(invoice.total).toLocaleString()}? It is saved there, not emailed.`)) return;
                  setQbNote("");
                  const show = openLater(); // opens the new invoice in QuickBooks when it is ready
                  run(async () => {
                    const res = await sendInvoiceToQuickBooks(projectId, invoice.id);
                    if (res.note) setQbNote(res.note);
                    show(res.link);
                    return res;
                  });
                }}
                style={primaryBtnStyle}
                title="Creates this invoice in QuickBooks with the Per Man / Per Welder lines and attaches the Excel backup"
              >
                {pending ? "Sending…" : "Send to QuickBooks"}
              </button>
            )}
            {!isDraft && !invoice.qbInvoiceId && !qb.connected && qb.configured && (
              <a href={`/api/quickbooks/connect?returnTo=${encodeURIComponent(`/projects/${projectId}`)}`} style={{ ...primaryBtnStyle, textDecoration: "none", display: "inline-block" }} title="One-time sign-in so White Board can create invoices in QuickBooks">
                Connect QuickBooks
              </a>
            )}
            {!isDraft && !invoice.qbInvoiceId && !qb.configured && (
              <span style={{ fontSize: "0.74rem", color: "var(--muted)", alignSelf: "center" }}>QuickBooks isn&apos;t set up for White Board yet.</span>
            )}
            <button onClick={handleExport} style={secondaryBtnStyle}>
              Export to Excel
            </button>
            <button
              onClick={() => {
                if (confirm("Delete this invoice? This cannot be undone.")) {
                  startTransition(() => deleteTmInvoice(projectId, invoice.id));
                }
              }}
              style={deleteBtnStyle}
            >
              🗑
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem", whiteSpace: "nowrap" }}>
              <thead>
                <tr>
                  {["Date", "Crew Member", "Position", "Leak #", "Locusview #", "Address", "Hours", "Rate", "Amount", ""].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(invoice.lineItems || []).map((li, i) => {
                  // Whole-row tint for the basic checks; single cells for the consistency checks.
                  const flagged = warnings.some((w) => !w.cells && w.crewMember === li.crewMember && w.date === li.date);
                  const hl = (field: "crewMember" | "position" | "leakNumber" | "locusviewNumber" | "address" | "hours"): React.CSSProperties =>
                    warnings.some((w) => w.cells?.some((c) => c.date === li.date && c.crewMember === li.crewMember && c.field === field && (c.value === undefined || c.value === String(li[field]))))
                      ? { background: "#ffe699", color: "#5c3d00" }
                      : {};
                  return (
                    <tr key={i} style={flagged ? { background: "var(--danger-bg, #fdecea)" } : undefined}>
                      <td style={tdStyle}>{li.date}</td>
                      <td style={{ ...tdStyle, fontFamily: "inherit", ...hl("crewMember") }}>{li.crewMember}</td>
                      <td style={{ ...tdStyle, fontFamily: "inherit", ...hl("position") }}>{li.position}</td>
                      <td style={{ ...tdStyle, ...hl("leakNumber") }}>{li.leakNumber}</td>
                      <td style={{ ...tdStyle, ...hl("locusviewNumber") }}>{li.locusviewNumber}</td>
                      <td style={{ ...tdStyle, fontFamily: "inherit", ...hl("address") }}>{li.address}</td>
                      <td style={{ ...tdStyle, ...hl("hours") }}>{li.hours}</td>
                      <td style={tdStyle}>${li.rate.toFixed(2)}</td>
                      <td style={tdStyle}>${li.amount.toFixed(2)}</td>
                      <td style={tdStyle}>
                        {invoice.status === "draft" && (
                          <button
                            onClick={() => {
                              if (confirm(`Remove ${li.crewMember}'s ${li.date} entry from this invoice?`)) {
                                startTransition(() => removeInvoiceLineItem(projectId, invoice.id, i));
                              }
                            }}
                            style={{ ...deleteBtnStyle, width: 22, height: 22, fontSize: "0.7rem" }}
                            title="Remove this line"
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function SubSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h4 style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted)" }}>{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{children}</p>;
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: "0.66rem", textTransform: "uppercase", color: "var(--muted)", padding: "6px 9px", background: "var(--surface-2)" };
const flagBadgeStyle: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 700, padding: "3px 9px", borderRadius: 20 };
const tdStyle: React.CSSProperties = { padding: "6px 9px", fontFamily: "var(--font-mono)", borderBottom: "1px solid var(--border)" };
