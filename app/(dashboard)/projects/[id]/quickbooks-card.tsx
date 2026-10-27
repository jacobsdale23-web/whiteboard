import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { qbJobs } from "@/lib/db/schema";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// White Board's own picture of the job: pay apps billed and the receipts,
// expenses and vendor invoices it has recorded. Kept separate from QuickBooks
// on purpose: the two often differ and neither overwrites the other.
export type WhiteboardFigures = { billed: number | null; cost: number };

// What QuickBooks shows for this job's project number, next to White Board's
// numbers. Admin-only, read-only: the QuickBooks figures are copied from its
// Projects page twice a week.
export default async function QuickBooksCard({ projectNumber, wb }: { projectNumber: string | null; wb: WhiteboardFigures }) {
  if (!projectNumber) return null;
  const job = await db.query.qbJobs.findFirst({ where: eq(qbJobs.projectNumber, projectNumber) });
  if (!job) return null;

  const qbIncome = Number(job.income);
  const qbCost = Number(job.cost);
  const qbProfit = qbIncome - qbCost;
  const qbMargin = qbIncome > 0 ? (qbProfit / qbIncome) * 100 : null;
  const wbProfit = wb.billed === null ? null : wb.billed - wb.cost;
  const synced = job.syncedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>QuickBooks · {job.projectNumber}</h3>
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
            <Row label="Job costs" qb={qbCost} wb={wb.cost} />
            <Row label="Profit" qb={qbProfit} wb={wbProfit} bold />
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 10, color: "var(--muted)", fontSize: "0.78rem" }}>
        <span>QuickBooks margin {qbMargin === null ? "—" : `${qbMargin.toFixed(1)}%`}</span>
        {job.hours !== null && <span>{Number(job.hours).toLocaleString("en-US", { maximumFractionDigits: 0 })} hours in QuickBooks</span>}
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
