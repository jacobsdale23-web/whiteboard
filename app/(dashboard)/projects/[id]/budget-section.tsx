"use client";

import { useState, useTransition } from "react";
import { addExpense, addInvoice, deleteExpense, deleteInvoice } from "./budget-actions";
import { deletePayApp } from "./payapp-actions";
import PayAppModal from "./payapp-modal";
import { sortedPayApps, rollupAt, itemStatsAt, type SovItemRow, type SovEntryRow, type PayAppRow } from "@/lib/sov";

const CATEGORIES = ["Materials", "Subcontractor", "Equipment", "Other"];

type Expense = { id: string; date: string | null; description: string | null; amount: string };
type Invoice = { id: string; invoiceNumber: string | null; vendor: string | null; date: string | null; amount: string; category: string };
type PayApp = PayAppRow & { id: string; period: string | null; applicationDate: string | null };

export default function BudgetSection({
  projectId,
  contractValue,
  expenses,
  invoices,
  payApps,
  sovItems,
  sovEntries,
}: {
  projectId: string;
  contractValue: string | null;
  expenses: Expense[];
  invoices: Invoice[];
  payApps: PayApp[];
  sovItems: SovItemRow[];
  sovEntries: SovEntryRow[];
}) {
  const [showPayAppModal, setShowPayAppModal] = useState(false);
  const [, startTransition] = useTransition();

  const ordered = sortedPayApps(payApps);
  const latestIndex = ordered.length - 1;
  const rollup = latestIndex >= 0 ? rollupAt(sovItems, sovEntries, ordered, latestIndex) : null;

  const totalCost = [...expenses, ...invoices].reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const billedToDate = rollup ? rollup.totalCompleted : 0;
  const margin = billedToDate - totalCost;
  const fallbackValue = contractValue !== null ? Number(contractValue) : null;

  return (
    <div style={cardStyle}>
      <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase", marginBottom: 14 }}>Budget</h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px,1fr))", gap: 10, marginBottom: 18 }}>
        <Stat label="Contract Value" value={fmt(rollup ? rollup.contractPrice : fallbackValue)} />
        <Stat label="Billed to Date" value={fmt(billedToDate)} />
        <Stat label="% Complete" value={rollup ? `${(rollup.pctComplete * 100).toFixed(1)}%` : "—"} />
        <Stat label="Remaining to Bill" value={rollup ? fmt(rollup.balanceToFinish) : "—"} />
        <Stat label="Total Cost" value={fmt(totalCost)} />
        <Stat label="Margin" value={fmt(margin)} danger={margin < 0} />
      </div>

      <SubSection title="Pay Applications" action={<button onClick={() => setShowPayAppModal(true)} style={addBtnStyle}>+ Add Pay Application</button>}>
        {ordered.length ? (
          ordered
            .slice()
            .reverse()
            .map((pa) => {
              const idx = ordered.indexOf(pa);
              const r = rollupAt(sovItems, sovEntries, ordered, idx);
              return (
                <div key={pa.id} style={rowStyle}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.87rem" }}>App #{pa.appNumber}</div>
                    <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>
                      {pa.period || ""} {pa.applicationDate ? `· ${pa.applicationDate}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: "0.84rem" }}>
                    <span>Due {fmt(r.amountDue)}</span>
                    <span style={{ color: "var(--muted)" }}>Billed {fmt(r.totalCompleted)}</span>
                    <button
                      onClick={() => {
                        if (confirm(`Delete Pay Application #${pa.appNumber}? This also removes it from the schedule-of-values history.`)) {
                          startTransition(() => deletePayApp(projectId, pa.id));
                        }
                      }}
                      style={deleteBtnStyle}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })
        ) : (
          <Empty>No pay applications yet.</Empty>
        )}

        {latestIndex >= 0 && (
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8, marginTop: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
              <thead>
                <tr>
                  {["Item", "Description", "Bid Qty", "Unit Price", "Bid Value", "Prev.", "This Period", "Qty to Date", "Value to Date", "Stored", "Completed + Stored", "%", "Balance"].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sovItems.map((item) => {
                  const s = itemStatsAt(item, sovEntries, ordered, latestIndex);
                  return (
                    <tr key={item.itemNo}>
                      <td style={tdStyle}>{item.itemNo}</td>
                      <td style={{ ...tdStyle, fontFamily: "inherit" }}>{item.description}</td>
                      <td style={tdStyle}>{Number(item.bidQty).toLocaleString()}</td>
                      <td style={tdStyle}>{fmt(s.unitPrice)}</td>
                      <td style={tdStyle}>{fmt(s.bidValue)}</td>
                      <td style={tdStyle}>{s.prev.toLocaleString()}</td>
                      <td style={tdStyle}>{s.thisQty.toLocaleString()}</td>
                      <td style={tdStyle}>{s.cumQty.toLocaleString()}</td>
                      <td style={tdStyle}>{fmt(s.cumValue)}</td>
                      <td style={tdStyle}>{fmt(s.storedVal)}</td>
                      <td style={tdStyle}>{fmt(s.totalCompleted)}</td>
                      <td style={tdStyle}>{(s.pct * 100).toFixed(1)}%</td>
                      <td style={tdStyle}>{fmt(s.balance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SubSection>

      <SubSection title="Expenses" action={<ExpenseForm projectId={projectId} />}>
        {expenses.length ? (
          expenses
            .slice()
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
            .map((e) => <ExpenseRow key={e.id} projectId={projectId} expense={e} />)
        ) : (
          <Empty>No expenses logged yet.</Empty>
        )}
      </SubSection>

      <SubSection title="Invoices" action={<InvoiceForm projectId={projectId} />}>
        {invoices.length ? (
          invoices
            .slice()
            .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
            .map((inv) => <InvoiceRow key={inv.id} projectId={projectId} invoice={inv} />)
        ) : (
          <Empty>No invoices logged yet.</Empty>
        )}
      </SubSection>

      {showPayAppModal && (
        <PayAppModal projectId={projectId} existingItems={sovItems} onClose={() => setShowPayAppModal(false)} />
      )}
    </div>
  );
}

function fmt(v: number | null): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return `$${Math.round(v).toLocaleString()}`;
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

function ExpenseForm({ projectId }: { projectId: string }) {
  const [show, setShow] = useState(false);
  if (!show) {
    return (
      <button onClick={() => setShow(true)} style={addBtnStyle}>
        + Add Expense
      </button>
    );
  }
  return (
    <form
      action={async (fd) => {
        await addExpense(projectId, fd);
        setShow(false);
      }}
      style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
    >
      <input type="date" name="date" required style={inputStyle} defaultValue={new Date().toISOString().slice(0, 10)} />
      <input type="text" name="description" placeholder="Description" required style={{ ...inputStyle, flex: 1 }} />
      <input type="number" name="amount" placeholder="Amount" min="0" step="0.01" required style={inputStyle} />
      <button type="submit" style={primaryBtnStyle}>
        Add
      </button>
      <button type="button" onClick={() => setShow(false)} style={secondaryBtnStyle}>
        Cancel
      </button>
    </form>
  );
}

function ExpenseRow({ projectId, expense }: { projectId: string; expense: Expense }) {
  const [, startTransition] = useTransition();
  return (
    <div style={rowStyle}>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--muted)" }}>{expense.date || "No date"}</div>
        <div style={{ fontSize: "0.87rem" }}>{expense.description}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>${Number(expense.amount).toLocaleString()}</span>
        <button
          onClick={() => {
            if (confirm("Delete this expense?")) startTransition(() => deleteExpense(projectId, expense.id));
          }}
          style={deleteBtnStyle}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

function InvoiceForm({ projectId }: { projectId: string }) {
  const [show, setShow] = useState(false);
  if (!show) {
    return (
      <button onClick={() => setShow(true)} style={addBtnStyle}>
        + Add Invoice
      </button>
    );
  }
  return (
    <form
      action={async (fd) => {
        await addInvoice(projectId, fd);
        setShow(false);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="text" name="invoiceNumber" placeholder="Invoice #" style={inputStyle} />
        <input type="text" name="vendor" placeholder="Vendor" required style={{ ...inputStyle, flex: 1 }} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="date" name="date" required style={inputStyle} defaultValue={new Date().toISOString().slice(0, 10)} />
        <input type="number" name="amount" placeholder="Amount" min="0" step="0.01" required style={inputStyle} />
        <select name="category" style={inputStyle} defaultValue="Materials">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" style={primaryBtnStyle}>
          Add
        </button>
        <button type="button" onClick={() => setShow(false)} style={secondaryBtnStyle}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function InvoiceRow({ projectId, invoice }: { projectId: string; invoice: Invoice }) {
  const [, startTransition] = useTransition();
  return (
    <div style={rowStyle}>
      <div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--muted)" }}>{invoice.date || "No date"}</div>
        <div style={{ fontSize: "0.87rem" }}>
          {invoice.vendor} {invoice.invoiceNumber ? `· #${invoice.invoiceNumber}` : ""} · {invoice.category}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>${Number(invoice.amount).toLocaleString()}</span>
        <button
          onClick={() => {
            if (confirm("Delete this invoice?")) startTransition(() => deleteInvoice(projectId, invoice.id));
          }}
          style={deleteBtnStyle}
        >
          🗑
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontSize: "0.64rem", textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "1rem", marginTop: 3, color: danger ? "var(--danger)" : "inherit" }}>{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{children}</p>;
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit" };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const thStyle: React.CSSProperties = { textAlign: "left", fontSize: "0.66rem", textTransform: "uppercase", color: "var(--muted)", padding: "6px 9px", background: "var(--surface-2)" };
const tdStyle: React.CSSProperties = { padding: "6px 9px", fontFamily: "var(--font-mono)", borderBottom: "1px solid var(--border)" };
