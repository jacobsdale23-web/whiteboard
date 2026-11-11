import { qbApi, qbQuery, qbQuote } from "@/lib/quickbooks";
import type { Charge } from "@/lib/receipt-match";

export type CardAccount = { id: string; name: string };

type QbPurchaseLine = {
  Id?: string;
  DetailType: string;
  Amount?: number;
  Description?: string;
  AccountBasedExpenseLineDetail?: { AccountRef?: { value: string; name?: string }; CustomerRef?: { value: string; name?: string }; BillableStatus?: string; [k: string]: unknown };
  [k: string]: unknown;
};
export type QbPurchase = {
  Id: string;
  SyncToken: string;
  TxnDate: string;
  TotalAmt: number;
  PaymentType?: string;
  Credit?: boolean;
  AccountRef?: { value: string; name?: string };
  EntityRef?: { value: string; name?: string };
  PrivateNote?: string;
  DocNumber?: string;
  Line?: QbPurchaseLine[];
};

export async function listCardAccounts(companyId: string): Promise<CardAccount[]> {
  const rows = await qbQuery<{ Id: string; Name: string; Active?: boolean }>(companyId, "select Id, Name, Active from Account where AccountType = 'Credit Card' and Active in (true, false)", "Account");
  return rows.filter((r) => r.Active !== false).map((r) => ({ id: r.Id, name: r.Name }));
}

// The booked charges on one card account since a date (newest first), plus how many other purchases were skipped.
export async function listCardCharges(companyId: string, accountId: string, since: string): Promise<{ charges: Charge[]; purchases: Map<string, QbPurchase> }> {
  const purchases = new Map<string, QbPurchase>();
  const charges: Charge[] = [];
  for (let start = 1; start < 5000; start += 500) {
    const page = await qbQuery<QbPurchase>(companyId, `select * from Purchase where TxnDate >= '${qbQuote(since)}' orderby TxnDate desc startposition ${start} maxresults 500`, "Purchase");
    for (const p of page) {
      if (p.AccountRef?.value !== accountId) continue;
      purchases.set(p.Id, p);
      const coded = (p.Line || []).some((l) => !!l.AccountBasedExpenseLineDetail?.CustomerRef);
      charges.push({
        id: p.Id,
        date: p.TxnDate,
        amount: Number(p.TotalAmt) || 0,
        vendor: p.EntityRef?.name || "",
        memo: [p.PrivateNote, (p.Line || []).map((l) => l.Description).filter(Boolean).join(" ")].filter(Boolean).join(" "),
        coded,
        credit: p.Credit === true,
      });
    }
    if (page.length < 500) break;
  }
  return { charges, purchases };
}

export async function getPurchase(companyId: string, id: string): Promise<QbPurchase | null> {
  if (!/^\d+$/.test(id)) return null;
  const res = await qbApi<{ Purchase?: QbPurchase }>(companyId, "GET", `/purchase/${id}`);
  return res.Purchase ?? null;
}

// Puts a QuickBooks job on a card charge's single expense line (job costing). Never touches amount, account or vendor.
// Returns an error string when it should not change anything, otherwise null after QuickBooks confirms.
export async function codePurchaseToJob(companyId: string, purchase: QbPurchase, jobCustomerId: string, jobName: string): Promise<string | null> {
  if (purchase.Credit === true) return "That is a credit, not a charge.";
  const lines = (purchase.Line || []).filter((l) => l.DetailType === "AccountBasedExpenseLineDetail");
  if (lines.length !== 1 || (purchase.Line || []).length !== 1) return "That charge has more than one line. Code it to the job in QuickBooks by hand.";
  const line = lines[0];
  const existing = line.AccountBasedExpenseLineDetail?.CustomerRef;
  if (existing) return existing.value === jobCustomerId ? null : `That charge is already coded to ${existing.name || "another customer"} in QuickBooks.`;
  const updated: QbPurchaseLine = {
    ...line,
    AccountBasedExpenseLineDetail: { ...line.AccountBasedExpenseLineDetail, CustomerRef: { value: jobCustomerId, name: jobName }, BillableStatus: "NotBillable" },
  };
  const res = await qbApi<{ Purchase?: QbPurchase }>(companyId, "POST", "/purchase", {
    Id: purchase.Id,
    SyncToken: purchase.SyncToken,
    sparse: true,
    PaymentType: purchase.PaymentType,
    AccountRef: purchase.AccountRef,
    Line: [updated],
  });
  const back = res.Purchase?.Line?.[0]?.AccountBasedExpenseLineDetail?.CustomerRef?.value;
  if (back !== jobCustomerId) return "QuickBooks didn't confirm the job on that charge. Check it in QuickBooks.";
  if (Math.round((Number(res.Purchase?.TotalAmt) || 0) * 100) !== Math.round(purchase.TotalAmt * 100)) return "The charge total changed unexpectedly. Check it in QuickBooks.";
  return null;
}
