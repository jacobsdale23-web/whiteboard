"use client";

import { useState, useTransition } from "react";
import {
  setBillingRate,
  addBillingTask,
  deleteBillingTask,
  generateInvoice,
  approveInvoice,
  deleteTmInvoice,
  setInvoiceNumber,
  exportInvoiceExcel,
  removeInvoiceLineItem,
} from "./billing-actions";

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
type TmWarning = { severity: "error" | "warning"; type: string; message: string; date: string; crewMember: string };
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
};

// Admin-only. Never render this component, or pass billing rates / invoice
// totals as props, for a non-admin session — field crew must only ever see
// position + hours on the Daily Log, never $/hr or computed amounts.
export default function BillingSection({
  projectId,
  billingRates,
  billingTasks,
  tmInvoices,
}: {
  projectId: string;
  billingRates: BillingRate[];
  billingTasks: BillingTask[];
  tmInvoices: TmInvoice[];
}) {
  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 4 }}>T&amp;M Billing</h3>
      <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 16 }}>
        🔒 Admin only — rates and invoice totals are never shown to field crew.
      </p>

      <RatesSubsection projectId={projectId} rates={billingRates} />
      <TasksSubsection projectId={projectId} tasks={billingTasks} />
      <InvoicesSubsection projectId={projectId} tasks={billingTasks} invoices={tmInvoices} />
    </div>
  );
}

function RatesSubsection({ projectId, rates }: { projectId: string; rates: BillingRate[] }) {
  const [, startTransition] = useTransition();
  const [edits, setEdits] = useState<Record<string, string>>({});

  return (
    <SubSection title="Hourly Rates by Position">
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
}: {
  projectId: string;
  tasks: BillingTask[];
  invoices: TmInvoice[];
}) {
  const [showGen, setShowGen] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

      {showGen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const billingTaskId = String(fd.get("billingTaskId") || "");
            const periodStart = String(fd.get("periodStart") || "");
            const periodEnd = String(fd.get("periodEnd") || "");
            setError(null);
            startTransition(async () => {
              try {
                await generateInvoice(projectId, billingTaskId, periodStart, periodEnd);
                setShowGen(false);
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
          .map((inv) => <InvoiceCard key={inv.id} projectId={projectId} invoice={inv} tasks={tasks} />)
      ) : (
        <Empty>No invoices generated yet.</Empty>
      )}
    </SubSection>
  );
}

function InvoiceCard({ projectId, invoice, tasks }: { projectId: string; invoice: TmInvoice; tasks: BillingTask[] }) {
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const task = tasks.find((t) => t.id === invoice.billingTaskId);
  const warnings = invoice.warnings || [];
  const errorCount = warnings.filter((w) => w.severity === "error").length;
  const warningCount = warnings.length - errorCount;

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
                  <li key={i} style={{ marginBottom: 3 }}>
                    {w.severity === "error" ? "🛑" : "⚠"} {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              type="text"
              defaultValue={invoice.invoiceNumber || ""}
              placeholder="Invoice #"
              onBlur={(e) => startTransition(() => setInvoiceNumber(projectId, invoice.id, e.target.value))}
              style={{ ...inputStyle, width: 140 }}
            />
            {invoice.status === "draft" && (
              <button
                onClick={() => startTransition(() => approveInvoice(projectId, invoice.id))}
                style={primaryBtnStyle}
              >
                Approve
              </button>
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
                  const flagged = warnings.some((w) => w.crewMember === li.crewMember && w.date === li.date);
                  return (
                    <tr key={i} style={flagged ? { background: "var(--danger-bg, #fdecea)" } : undefined}>
                      <td style={tdStyle}>{li.date}</td>
                      <td style={{ ...tdStyle, fontFamily: "inherit" }}>{li.crewMember}</td>
                      <td style={{ ...tdStyle, fontFamily: "inherit" }}>{li.position}</td>
                      <td style={tdStyle}>{li.leakNumber}</td>
                      <td style={tdStyle}>{li.locusviewNumber}</td>
                      <td style={{ ...tdStyle, fontFamily: "inherit" }}>{li.address}</td>
                      <td style={tdStyle}>{li.hours}</td>
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
