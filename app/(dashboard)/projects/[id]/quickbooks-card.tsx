import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { qbJobs, qbInvoices } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// White Board's own picture of the job: pay apps billed and the receipts,
// expenses and vendor invoices it has recorded. Kept separate from QuickBooks
// on purpose: the two often differ and neither overwrites the other.
export type WhiteboardFigures = { billed: number | null; cost: number };

// What QuickBooks shows for this job's project number, next to White Board's
// numbers. Admin-only, read-only: the QuickBooks figures are copied from its
// Projects page. Each company has its own QuickBooks, so the lookup is by company;
// a QuickBooks project with no number is matched by name.
export default async function QuickBooksCard({
  companyId,
  projectNumber,
  projectName,
  wb,
  quoteInvoiceNos = [],
}: {
  companyId: string;
  projectNumber: string | null;
  projectName: string;
  wb: WhiteboardFigures;
  // Invoices recorded against this job's quotes (billed to the customer, not to the numbered job in QuickBooks).
  quoteInvoiceNos?: string[];
}) {
  const key = projectNumber || projectName;
  // Checked here as well as by the page, so these figures can never render for a non-admin.
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") return null;
  const job = await db.query.qbJobs.findFirst({ where: and(eq(qbJobs.companyId, companyId), eq(qbJobs.projectNumber, key)) });
  if (!job) return null;

  // The invoices behind the income figure: billed to this job's number in QuickBooks, or recorded on one of its quotes.
  const byJob = projectNumber ? [eq(qbInvoices.projectNumber, projectNumber)] : [];
  const byQuote = quoteInvoiceNos.length ? [inArray(qbInvoices.invoiceNo, quoteInvoiceNos)] : [];
  const invoices =
    byJob.length || byQuote.length
      ? await db
          .select()
          .from(qbInvoices)
          .where(and(eq(qbInvoices.companyId, companyId), or(...byJob, ...byQuote)))
          .orderBy(desc(qbInvoices.txnDate))
      : [];
  const listed = invoices.reduce((s, i) => s + Number(i.amount), 0);
  const unpaid = invoices.reduce((s, i) => s + Number(i.balance), 0);

  const qbIncome = Number(job.income);
  const qbCost = Number(job.cost);
  const qbProfit = qbIncome - qbCost;
  const qbMargin = qbIncome > 0 ? (qbProfit / qbIncome) * 100 : null;
  const wbProfit = wb.billed === null ? null : wb.billed - wb.cost;
  // Nothing recorded in White Board yet: show dashes rather than a big "difference".
  const wbEmpty = wb.billed === null && wb.cost === 0;
  const synced = job.syncedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>QuickBooks{projectNumber ? ` · ${job.projectNumber}` : ""}</h3>
        <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
          {job.status ? `${job.status} in QuickBooks · ` : ""}synced {synced}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
          <thead>
            <tr>
              <th style={th} />
              <th style={{ ...th, textAlign: "right" }}>QuickBooks</th>
              <th style={{ ...th, textAlign: "right" }}>White Board</th>
              <th style={{ ...th, textAlign: "right" }}>Difference</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Income billed" qb={qbIncome} wb={wb.billed} />
            <Row label="Job costs" qb={qbCost} wb={wbEmpty ? null : wb.cost} />
            <Row label="Profit" qb={qbProfit} wb={wbProfit} bold />
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 10, color: "var(--muted)", fontSize: "0.78rem" }}>
        <span>QuickBooks margin {qbMargin === null ? "—" : `${qbMargin.toFixed(1)}%`}</span>
        {job.hours !== null && <span>{Number(job.hours).toLocaleString("en-US", { maximumFractionDigits: 0 })} hours in QuickBooks</span>}
      </div>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
          <strong style={{ fontSize: "0.74rem", textTransform: "uppercase", color: "var(--muted)" }}>Invoices in QuickBooks</strong>
          {invoices.length > 0 && (
            <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
              {invoices.length} invoice{invoices.length === 1 ? "" : "s"} · {money(listed)}
              {unpaid > 0.005 ? ` · ${money(unpaid)} unpaid` : " · all paid"}
            </span>
          )}
        </div>
        {invoices.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <tbody>
                {invoices.map((i) => {
                  const open = Number(i.balance) > 0.005;
                  return (
                    <tr key={i.invoiceNo} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ ...td, whiteSpace: "nowrap", fontWeight: 600 }}>
                        {i.link ? (
                          <a href={i.link} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                            #{i.invoiceNo} ↗
                          </a>
                        ) : (
                          `#${i.invoiceNo}`
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: "var(--muted)" }}>{i.txnDate}</td>
                      <td style={{ ...td, color: "var(--ink-soft)", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={i.memo || ""}>
                        {i.memo || i.customer}
                      </td>
                      <td style={{ ...td, ...num }}>{money(Number(i.amount))}</td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: open ? "var(--danger)" : "var(--active)" }}>{open ? `${money(Number(i.balance))} due` : "Paid"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>No invoices copied from QuickBooks for this job yet. They refresh with the twice-weekly QuickBooks check.</p>
        )}
        {invoices.length > 0 && Math.abs(listed - qbIncome) > 0.5 && (
          <p style={{ color: "var(--muted)", fontSize: "0.74rem", marginTop: 6 }}>
            These add up to {money(listed)}; QuickBooks shows {money(qbIncome)} income for the job, so some invoices (older, or billed under another name) aren&apos;t listed.
          </p>
        )}
      </div>

      <p style={{ color: "var(--muted)", fontSize: "0.74rem", marginTop: 8 }}>
        QuickBooks costs are payroll-based and may be incomplete. White Board counts pay apps, receipts, expenses and vendor invoices recorded here (its income shows only when the job has pay apps). The two can differ; neither overwrites the other.
      </p>
    </div>
  );
}

function Row({ label, qb, wb, bold }: { label: string; qb: number; wb: number | null; bold?: boolean }) {
  const diff = wb === null ? null : wb - qb;
  return (
    <tr style={{ borderTop: "1px solid var(--border)", fontWeight: bold ? 700 : 400 }}>
      <td style={td}>{label}</td>
      <td style={{ ...td, ...num, color: bold && qb < 0 ? "var(--danger)" : undefined }}>{money(qb)}</td>
      <td style={{ ...td, ...num, color: bold && wb !== null && wb < 0 ? "var(--danger)" : undefined }}>{wb === null ? "—" : money(wb)}</td>
      <td style={{ ...td, ...num, color: "var(--muted)" }}>{diff === null ? "—" : `${diff > 0 ? "+" : ""}${money(diff)}`}</td>
    </tr>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "4px 10px 8px", fontSize: "0.68rem", textTransform: "uppercase", color: "var(--muted)", fontWeight: 700 };
const td: React.CSSProperties = { padding: "8px 10px" };
const num: React.CSSProperties = { textAlign: "right", fontFamily: "var(--font-mono)", whiteSpace: "nowrap" };
