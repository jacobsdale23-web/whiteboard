import { NextResponse } from "next/server";
import { getConnection, qbConfig } from "@/lib/quickbooks";
import { runReceiptMatch } from "@/lib/receipt-autocode";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Daily: match the receipts foremen scanned to the Capital One charges in QuickBooks. Matching itself never changes
// QuickBooks. Coding the matched charges to their jobs in QuickBooks happens only when RECEIPT_AUTOCODE=1 is set in
// Vercel (Jacob turns it on once the first manual coding has checked out). Vercel sends Authorization: Bearer CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!qbConfig().configured || !(await getConnection("fwi"))) {
    return NextResponse.json({ skipped: "QuickBooks isn't connected for fwi." });
  }
  try {
    const summary = await runReceiptMatch("fwi", { autoCode: process.env.RECEIPT_AUTOCODE === "1" });
    console.log(JSON.stringify({ receiptMatch: summary }));
    return NextResponse.json(summary);
  } catch (e) {
    console.error("receipt-match run failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
