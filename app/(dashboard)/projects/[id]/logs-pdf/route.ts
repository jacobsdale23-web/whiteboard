import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, dailyLogs, lineItems, projects } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { canAccessCompany } from "@/lib/auth/company";
import { buildDailyLogsPdf } from "@/lib/daily-log-pdf";
import { getObjectBuffer } from "@/lib/storage/s3";

// Admin-only: a client-ready PDF of one log, a hand-picked set (?ids=a,b,c),
// or a date range (?from=YYYY-MM-DD&to=YYYY-MM-DD).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") return new Response("Only admins can export daily logs.", { status: 403 });

  const { id } = await params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project || !(await canAccessCompany(project.companyId))) return new Response("Project not found.", { status: 404 });
  const company = await db.query.companies.findFirst({ where: eq(companies.id, project.companyId) });

  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";

  let rows;
  let rangeLabel: string;
  if (ids.length) {
    rows = await db.select().from(dailyLogs).where(and(eq(dailyLogs.projectId, id), inArray(dailyLogs.id, ids)));
    rangeLabel = "Selected logs";
  } else if (from || to) {
    const conds = [eq(dailyLogs.projectId, id)];
    if (from) conds.push(gte(dailyLogs.date, from));
    if (to) conds.push(lte(dailyLogs.date, to));
    rows = await db.select().from(dailyLogs).where(and(...conds));
    rangeLabel = `${from || "start"} to ${to || "present"}`;
  } else {
    return new Response("Pick logs or a date range to export.", { status: 400 });
  }
  if (!rows.length) return new Response("No daily logs match.", { status: 404 });

  rows.sort((a, b) => a.date.localeCompare(b.date));
  const items = await db.select().from(lineItems).where(eq(lineItems.projectId, id));
  const itemDesc = new Map(items.map((i) => [i.itemNo, i.description]));
  const itemUnit = new Map(items.map((i) => [i.itemNo, i.unit]));

  // A picture that can't be fetched is skipped rather than failing the whole export.
  type Pic = { bytes: Uint8Array; caption: string };
  const photoBytes = new Map<string, Pic[]>();
  for (const l of rows) {
    const got: (Pic | null)[] = await Promise.all(
      (l.photos || []).map(async (p): Promise<Pic | null> => {
        try {
          return { bytes: new Uint8Array(await getObjectBuffer(p.key)), caption: p.caption };
        } catch {
          return null;
        }
      })
    );
    photoBytes.set(l.id, got.filter((x): x is Pic => !!x));
  }

  const pdf = await buildDailyLogsPdf(
    { name: project.name, projectNumber: project.projectNumber, customer: project.customer, location: project.location, companyName: company?.name ?? "" },
    rows.map((l) => ({
      photos: photoBytes.get(l.id) || [],
      date: l.date,
      foreman: l.foreman,
      leakNumber: l.leakNumber,
      taskNumber: l.taskNumber,
      locusviewNumber: l.locusviewNumber,
      address: l.address,
      lineItem: l.lineItem,
      lineItemDescription: l.lineItem ? itemDesc.get(l.lineItem) || null : null,
      quantities: (l.quantities || []).map((q) => ({ itemNo: q.itemNo, description: itemDesc.get(q.itemNo) || null, unit: itemUnit.get(q.itemNo) || null, qty: q.qty })),
      crew: l.crew || [],
      description: l.description,
      scopeChange: l.scopeChange,
    })),
    rangeLabel
  );

  const safe = project.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 40) || "project";
  const first = rows[0].date;
  const last = rows[rows.length - 1].date;
  const filename = `Daily-Logs-${safe}-${first}${last !== first ? `_to_${last}` : ""}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` },
  });
}
