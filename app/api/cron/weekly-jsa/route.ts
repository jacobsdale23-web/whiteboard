import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { buildWeeklyJsaReport, emailWeeklyJsaReport, jsaRecipients } from "@/lib/jsa-report";

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
// ?force=1 (ignore the Friday 4 PM check), ?end=YYYY-MM-DD (week ending date),
// ?company=fwi|om|pip|pgroup (just one company; default is all of them).
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
  const only = url.searchParams.get("company");
  const allCompanies = await db.select().from(companies).orderBy(asc(companies.sortOrder));
  const selected = allCompanies.filter((c) => !only || c.id === only);

  // One report (and one email) per company, each to that company's safety coordinator(s).
  const pdfFor = url.searchParams.get("pdf");
  const results = [];
  for (const company of selected) {
    const report = await buildWeeklyJsaReport(end, company.id);

    if (pdfFor) {
      const crew = report.crews.find((c) => c.foreman.toLowerCase() === pdfFor.toLowerCase());
      if (!crew) continue;
      return new Response(Buffer.from(crew.pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${crew.filename}"` } });
    }

    const summary = { company: company.id, start: report.start, end: report.end, crews: report.crews.map((c) => ({ foreman: c.foreman, jsaCount: c.jsaCount, bytes: c.pdf.length })) };
    if (url.searchParams.has("dryRun")) {
      results.push({ ...summary, to: await jsaRecipients(company.id) });
      continue;
    }

    const to = await jsaRecipients(company.id);
    if (!to.length) {
      results.push({ ...summary, skipped: "No safety coordinator or JSA_REPORT_TO for this company." });
      continue;
    }
    const sent = await emailWeeklyJsaReport(report, company.name, to);
    results.push({ ...summary, sent: true, to: sent.to });
  }

  if (pdfFor) return NextResponse.json({ error: "No such crew in this week." }, { status: 404 });
  return NextResponse.json({ dryRun: url.searchParams.has("dryRun") || undefined, companies: results });
}
