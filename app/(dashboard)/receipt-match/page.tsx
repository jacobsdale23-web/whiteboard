import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, receipts } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireCompany } from "@/lib/auth/company";
import { getConnection, qbConfig } from "@/lib/quickbooks";
import { listCardAccounts, listCardCharges } from "@/lib/qb-cards";
import { matchReceipts, type ReceiptLite } from "@/lib/receipt-match";
import MatchView from "./match-view";

export const dynamic = "force-dynamic";

const DAY_CHOICES = [30, 45, 60, 90];

export default async function ReceiptMatchPage({ searchParams }: { searchParams: Promise<{ account?: string; days?: string }> }) {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") redirect("/board");
  const company = await requireCompany();
  const sp = await searchParams;

  const box = (children: React.ReactNode) => (
    <section>
      <h2 style={{ marginBottom: 8 }}>Receipt match</h2>
      {children}
    </section>
  );
  if (company.id !== "fwi") return box(<p style={{ color: "var(--muted)" }}>This works for Feliciana Welders only for now. Switch company at the top right.</p>);
  if (!qbConfig().configured) return box(<p style={{ color: "var(--muted)" }}>QuickBooks isn&apos;t set up for White Board yet.</p>);
  if (!(await getConnection(company.id))) {
    return box(
      <p>
        QuickBooks isn&apos;t connected for this company.{" "}
        <a href="/api/quickbooks/connect?returnTo=/receipt-match" style={{ textDecoration: "underline" }}>
          Connect QuickBooks
        </a>
      </p>
    );
  }

  const days = DAY_CHOICES.includes(Number(sp.days)) ? Number(sp.days) : 45;
  let accounts: Awaited<ReturnType<typeof listCardAccounts>> = [];
  let error = "";
  try {
    accounts = await listCardAccounts(company.id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't read QuickBooks.";
  }
  const accountId = accounts.find((a) => a.id === sp.account)?.id ?? accounts.find((a) => /capital\s*(one|1)/i.test(a.name))?.id ?? accounts[0]?.id ?? "";

  const since = new Date(Date.now() - days * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  let charges: Awaited<ReturnType<typeof listCardCharges>>["charges"] = [];
  if (accountId && !error) {
    try {
      charges = (await listCardCharges(company.id, accountId, since)).charges;
    } catch (e) {
      error = e instanceof Error ? e.message : "Couldn't read the card charges.";
    }
  }

  // Receipts from the same window (a receipt dated a few days before the window can still match a charge inside it).
  const rows = await db
    .select({ r: receipts, p: projects })
    .from(receipts)
    .innerJoin(projects, eq(projects.id, receipts.projectId))
    .where(and(eq(projects.companyId, company.id), gte(receipts.date, new Date(Date.now() - (days + 5) * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }))));
  const lite: ReceiptLite[] = rows.map(({ r, p }) => ({
    id: r.id,
    date: r.date,
    amount: Number(r.amount),
    vendor: r.vendor,
    projectId: p.id,
    projectName: p.projectNumber ? `${p.projectNumber} · ${p.name}` : p.name,
    submittedBy: r.submittedBy,
    qbTxnId: r.qbTxnId,
  }));
  const result = matchReceipts(lite, charges);
  const chargeById = new Map(charges.map((c) => [c.id, c]));
  const matched = rows
    .filter(({ r }) => r.qbTxnId)
    .map(({ r, p }) => ({ receiptId: r.id, vendor: r.vendor, amount: Number(r.amount), date: r.date, project: p.projectNumber ? `${p.projectNumber} · ${p.name}` : p.name, coded: !!r.qbCodedAt, chargeDate: chargeById.get(r.qbTxnId as string)?.date ?? null, chargeCoded: chargeById.get(r.qbTxnId as string)?.coded ?? false }));
  const total = charges.filter((c) => !c.credit).reduce((s, c) => s + c.amount, 0);

  return (
    <section>
      <h2 style={{ marginBottom: 6 }}>Receipt match</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 14 }}>
        Matches the receipts foremen scan to the card charges booked in QuickBooks. <Link href="/board" style={{ textDecoration: "underline" }}>Back to Board</Link>
      </p>
      <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14, fontSize: "0.85rem" }}>
        <label>
          Card{" "}
          <select name="account" defaultValue={accountId} style={selStyle}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Last{" "}
          <select name="days" defaultValue={String(days)} style={selStyle}>
            {DAY_CHOICES.map((d) => (
              <option key={d} value={d}>
                {d} days
              </option>
            ))}
          </select>
        </label>
        <button type="submit" style={{ ...selStyle, cursor: "pointer", fontWeight: 600 }}>
          Show
        </button>
      </form>
      {error ? (
        <p style={{ color: "var(--danger)" }}>{error}</p>
      ) : !accounts.length ? (
        <p style={{ color: "var(--muted)" }}>QuickBooks has no credit card accounts on this connection.</p>
      ) : (
        <MatchView
          cardName={accounts.find((a) => a.id === accountId)?.name || ""}
          chargeCount={charges.length}
          chargeTotal={total}
          alreadyMatched={result.alreadyMatched}
          autoCodeOn={process.env.RECEIPT_AUTOCODE === "1"}
          suggestions={result.suggestions.map((s) => ({ receiptId: s.receipt.id, txnId: s.charge.id, confidence: s.confidence, auto: s.auto, note: s.note, days: s.days, receipt: { vendor: s.receipt.vendor, amount: s.receipt.amount, date: s.receipt.date, project: s.receipt.projectName, by: s.receipt.submittedBy }, charge: { vendor: s.charge.vendor, memo: s.charge.memo, amount: s.charge.amount, date: s.charge.date, coded: s.charge.coded } }))}
          matched={matched}
          chargesWithoutReceipt={result.chargesWithoutReceipt.map((c) => ({ id: c.id, vendor: c.vendor, memo: c.memo, amount: c.amount, date: c.date, coded: c.coded }))}
          receiptsWithoutCharge={result.receiptsWithoutCharge.map((r) => ({ id: r.id, vendor: r.vendor, amount: r.amount, date: r.date, project: r.projectName, by: r.submittedBy }))}
        />
      )}
    </section>
  );
}

const selStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 8px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit" };
