import { and, eq, gte, lte } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { jsaForms, profileCompanies, profiles, projects } from "@/lib/db/schema";
import { Writer, PAGE_W, MARGIN } from "@/lib/pdf-writer";

type Jsa = typeof jsaForms.$inferSelect;
export type CrewReport = { foreman: string; jsaCount: number; pdf: Uint8Array; filename: string };
export type WeeklyReport = { start: string; end: string; crews: CrewReport[] };

async function buildCrewPdf(foreman: string, start: string, end: string, entries: { jsa: Jsa; project: string }[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  w.text("Weekly JSA Report", { size: 20, bold: true });
  w.text(`Foreman / Crew: ${foreman}`, { size: 12, bold: true });
  w.text(`${start} to ${end}  -  ${entries.length} JSA${entries.length === 1 ? "" : "s"}`, { size: 10, color: [0.4, 0.4, 0.4] });
  w.gap(10);

  for (const { jsa, project } of entries) {
    w.ensure(90);
    w.rule();
    w.text(`${jsa.date}  -  ${project}`, { size: 13, bold: true });
    w.text(`Foreman: ${jsa.foreman || "-"}     Weather: ${jsa.weather || "-"}`);
    w.gap(4);
    w.text("Work performed", { bold: true });
    w.text(jsa.taskTypes?.length ? jsa.taskTypes.join(", ") : "-", { indent: 8 });
    if (jsa.hazards?.length) {
      w.gap(4);
      w.text("Hazards and controls", { bold: true });
      for (const h of jsa.hazards) {
        w.text(`${h.taskType}: ${h.hazard}`, { indent: 8, bold: true });
        w.text(`Control: ${h.control}`, { indent: 16 });
      }
    }
    w.gap(4);
    w.text("PPE required", { bold: true });
    w.text(jsa.ppe?.length ? jsa.ppe.join(", ") : "-", { indent: 8 });
    w.gap(4);
    w.text("Additional site-specific hazards / notes", { bold: true });
    w.text(jsa.additionalHazards || "-", { indent: 8 });
    if (jsa.emergencyInfo) {
      w.gap(4);
      w.text("Emergency info", { bold: true });
      w.text(jsa.emergencyInfo, { indent: 8 });
    }
    w.gap(4);
    w.text("Crew present and acknowledgements", { bold: true });
    if (jsa.crew?.length) {
      for (const c of jsa.crew) {
        const ack = c.acknowledgedAt ? `acknowledged ${new Date(c.acknowledgedAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}` : "NOT acknowledged";
        w.text(`${c.name} - ${ack}`, { indent: 8, color: c.acknowledgedAt ? [0.1, 0.1, 0.1] : [0.7, 0.1, 0.1] });
      }
    } else w.text("-", { indent: 8 });
    w.gap(8);
  }

  const pages = doc.getPages();
  pages.forEach((p, i) =>
    p.drawText(`Page ${i + 1} of ${pages.length}`, { x: PAGE_W - MARGIN - 60, y: 24, size: 8, font, color: rgb(0.5, 0.5, 0.5) })
  );
  return doc.save();
}

export async function buildWeeklyJsaReport(end: string, companyId: string): Promise<WeeklyReport> {
  const endDate = new Date(end + "T00:00:00");
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6);
  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;

  const [weekJsas, allProjects] = await Promise.all([
    db.select().from(jsaForms).where(and(gte(jsaForms.date, start), lte(jsaForms.date, end))),
    db.select({ id: projects.id, name: projects.name, projectNumber: projects.projectNumber }).from(projects).where(eq(projects.companyId, companyId)),
  ]);
  const inCompany = new Set(allProjects.map((p) => p.id));
  const jsas = weekJsas.filter((j) => inCompany.has(j.projectId));
  const projectLabel = new Map(allProjects.map((p) => [p.id, p.projectNumber ? `${p.projectNumber} ${p.name}` : p.name]));

  const byForeman = new Map<string, { display: string; entries: { jsa: Jsa; project: string }[] }>();
  for (const jsa of jsas) {
    const display = (jsa.foreman || "Unknown foreman").trim();
    const key = display.toLowerCase();
    if (!byForeman.has(key)) byForeman.set(key, { display, entries: [] });
    byForeman.get(key)!.entries.push({ jsa, project: projectLabel.get(jsa.projectId) || "Unknown project" });
  }

  const crews: CrewReport[] = [];
  for (const { display, entries } of [...byForeman.values()].sort((a, b) => a.display.localeCompare(b.display))) {
    entries.sort((a, b) => a.jsa.date.localeCompare(b.jsa.date) || a.project.localeCompare(b.project));
    crews.push({
      foreman: display,
      jsaCount: entries.length,
      pdf: await buildCrewPdf(display, start, end, entries),
      filename: `JSA - ${display.replace(/[^a-z0-9 ]+/gi, "").trim()} - ${start} to ${end}.pdf`,
    });
  }
  return { start, end, crews };
}

// Who gets a company's report: JSA_REPORT_TO overrides (handy for sending to
// yourself first); otherwise everyone marked Safety Coordinator on the Team
// page who can open that company.
export async function jsaRecipients(companyId: string): Promise<string[]> {
  const override = (process.env.JSA_REPORT_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (override.length) return override;
  const safety = await db.select().from(profiles).where(eq(profiles.isSafety, true));
  const member = await db.select().from(profileCompanies).where(eq(profileCompanies.companyId, companyId));
  const ids = new Set(member.map((m) => m.profileId));
  return safety.filter((p) => p.allCompanies || ids.has(p.id)).map((p) => p.email).filter(Boolean);
}

export async function emailWeeklyJsaReport(report: WeeklyReport, companyName: string, to: string[]): Promise<{ to: string[] }> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) throw new Error("SMTP_USER and SMTP_PASSWORD must be set.");
  if (!to.length) throw new Error("No recipient: mark a Safety Coordinator on the Team page, or set JSA_REPORT_TO.");

  // Defaults are Microsoft 365 / Outlook; override SMTP_HOST / SMTP_PORT for another provider.
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
  });
  const total = report.crews.reduce((n, c) => n + c.jsaCount, 0);
  const lines = report.crews.map((c) => `  - ${c.foreman}: ${c.jsaCount} JSA${c.jsaCount === 1 ? "" : "s"}`);
  const text = total
    ? `Attached are the ${companyName} Job Safety Analyses submitted ${report.start} to ${report.end}, one PDF per crew.\n\n${lines.join("\n")}\n\nTotal: ${total}\n\nSent automatically by White Board.`
    : `No ${companyName} JSAs were submitted ${report.start} to ${report.end}.\n\nSent automatically by White Board.`;

  await transport.sendMail({
    from: `White Board <${user}>`,
    to,
    subject: `Weekly JSA Report - ${companyName}: ${report.start} to ${report.end}`,
    text,
    attachments: report.crews.map((c) => ({ filename: c.filename, content: Buffer.from(c.pdf), contentType: "application/pdf" })),
  });
  return { to };
}
