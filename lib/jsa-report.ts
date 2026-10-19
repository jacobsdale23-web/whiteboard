import { and, gte, lte } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { jsaForms, projects } from "@/lib/db/schema";

type Jsa = typeof jsaForms.$inferSelect;
export type CrewReport = { foreman: string; jsaCount: number; pdf: Uint8Array; filename: string };
export type WeeklyReport = { start: string; end: string; crews: CrewReport[] };

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

// pdf-lib's built-in fonts only cover WinAnsi; anything else would throw.
function clean(s: string): string {
  let out = "";
  for (const ch of s.replace(/\r/g, "")) {
    const c = ch.codePointAt(0)!;
    out += ch === "\n" || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.has(ch) ? ch : "?";
  }
  return out;
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }
  ensure(h: number) {
    if (this.y - h < MARGIN + 20) this.newPage();
  }
  gap(h: number) {
    this.y -= h;
  }
  text(s: string, opts: { size?: number; bold?: boolean; indent?: number; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    const maxW = PAGE_W - MARGIN * 2 - indent;
    for (const para of clean(s).split("\n")) {
      let line = "";
      const flush = () => {
        this.ensure(size + 4);
        this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color: rgb(...(opts.color ?? [0.1, 0.1, 0.1])) });
        this.y -= size + 4;
        line = "";
      };
      for (const word of para.split(" ")) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxW && line) {
          flush();
          line = word;
        } else line = test;
      }
      flush();
    }
  }
  rule() {
    this.ensure(8);
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 2 }, end: { x: PAGE_W - MARGIN, y: this.y - 2 }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
    this.y -= 8;
  }
}

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

export async function buildWeeklyJsaReport(end: string): Promise<WeeklyReport> {
  const endDate = new Date(end + "T00:00:00");
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 6);
  const start = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;

  const [jsas, allProjects] = await Promise.all([
    db.select().from(jsaForms).where(and(gte(jsaForms.date, start), lte(jsaForms.date, end))),
    db.select({ id: projects.id, name: projects.name, projectNumber: projects.projectNumber }).from(projects),
  ]);
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

export async function emailWeeklyJsaReport(report: WeeklyReport): Promise<{ to: string[] }> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const to = (process.env.JSA_REPORT_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!user || !pass || !to.length) throw new Error("GMAIL_USER, GMAIL_APP_PASSWORD and JSA_REPORT_TO must all be set.");

  const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  const total = report.crews.reduce((n, c) => n + c.jsaCount, 0);
  const lines = report.crews.map((c) => `  - ${c.foreman}: ${c.jsaCount} JSA${c.jsaCount === 1 ? "" : "s"}`);
  const text = total
    ? `Attached are the Job Safety Analyses submitted ${report.start} to ${report.end}, one PDF per crew.\n\n${lines.join("\n")}\n\nTotal: ${total}\n\nSent automatically by White Board.`
    : `No JSAs were submitted ${report.start} to ${report.end}.\n\nSent automatically by White Board.`;

  await transport.sendMail({
    from: `White Board <${user}>`,
    to,
    subject: `Weekly JSA Report: ${report.start} to ${report.end}`,
    text,
    attachments: report.crews.map((c) => ({ filename: c.filename, content: Buffer.from(c.pdf), contentType: "application/pdf" })),
  });
  return { to };
}
