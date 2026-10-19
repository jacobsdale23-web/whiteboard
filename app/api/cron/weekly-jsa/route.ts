import { NextResponse } from "next/server";
import { buildWeeklyJsaReport, emailWeeklyJsaReport } from "@/lib/jsa-report";

export const maxDuration = 120;

function centralNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday: parts.weekday };
}

// Vercel cron calls this twice on Fridays (21:00 and 22:00 UTC) because the
// cron clock is UTC and doesn't follow daylight saving; only the call that
// lands at 4 PM Central actually sends.
// Manual testing: add ?dryRun=1 (summary only), ?pdf=<foreman> (view one PDF),
// ?force=1 (ignore the Friday 4 PM check), ?end=YYYY-MM-DD (week ending date).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const now = centralNow();
  const manual = url.searchParams.has("force") || url.searchParams.has("dryRun") || url.searchParams.has("pdf");
  if (!manual && !(now.weekday === "Fri" && now.hour === 16)) {
    return NextResponse.json({ skipped: true, reason: `Not Friday 4 PM Central (it is ${now.weekday} ${now.hour}:00).` });
  }

  const end = url.searchParams.get("end") || now.date;
  const report = await buildWeeklyJsaReport(end);

  const pdfFor = url.searchParams.get("pdf");
  if (pdfFor) {
    const crew = report.crews.find((c) => c.foreman.toLowerCase() === pdfFor.toLowerCase());
    if (!crew) return NextResponse.json({ error: "No such crew in this week." }, { status: 404 });
    return new Response(Buffer.from(crew.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${crew.filename}"` } });
  }

  const summary = { start: report.start, end: report.end, crews: report.crews.map((c) => ({ foreman: c.foreman, jsaCount: c.jsaCount, bytes: c.pdf.length })) };
  if (url.searchParams.has("dryRun")) return NextResponse.json({ dryRun: true, ...summary });

  const sent = await emailWeeklyJsaReport(report);
  return NextResponse.json({ sent: true, to: sent.to, ...summary });
}
