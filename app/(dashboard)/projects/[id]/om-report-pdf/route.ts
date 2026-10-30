import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, omReports, projects } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { canAccessCompany } from "@/lib/auth/company";
import { getObjectBuffer } from "@/lib/storage/s3";
import { buildOmReportPdf, type OmPdfPhoto } from "@/lib/om-report-pdf";

// One O&M field report as a PDF in the familiar O&M layout (?id=reportId). Anyone who can open the project can
// print it: it has no costs or rates, just what was found and done.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionAndProfile())) return new Response("Please sign in.", { status: 401 });

  const { id } = await params;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project || !(await canAccessCompany(project.companyId))) return new Response("Project not found.", { status: 404 });

  const reportId = new URL(req.url).searchParams.get("id") || "";
  const report = await db.query.omReports.findFirst({ where: and(eq(omReports.id, reportId), eq(omReports.projectId, id)) });
  if (!report) return new Response("Report not found.", { status: 404 });
  const company = await db.query.companies.findFirst({ where: eq(companies.id, project.companyId) });

  // A photo that can't be fetched is skipped rather than failing the whole report.
  const fetched: (OmPdfPhoto | null)[] = await Promise.all(
    (report.photos || []).map(async (p) => {
      try {
        return { bytes: new Uint8Array(await getObjectBuffer(p.key)), caption: p.caption };
      } catch {
        return null;
      }
    })
  );
  const photos = fetched.filter((p): p is OmPdfPhoto => !!p);

  const pdf = await buildOmReportPdf(
    { name: project.name, projectNumber: project.projectNumber, companyName: company?.name ?? "" },
    { date: report.date, jobType: report.jobType, extras: report.extras || [], data: report.data || {}, technician: report.technician, signature: report.signature },
    photos
  );

  const safe = String(report.data?.address || project.name).replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 40) || "report";
  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="OM-Report-${safe}-${report.date}.pdf"` },
  });
}
