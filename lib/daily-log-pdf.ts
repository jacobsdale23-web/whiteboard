import { PDFDocument, StandardFonts } from "pdf-lib";
import { Writer, addPageNumbers } from "@/lib/pdf-writer";

export type PdfLog = {
  date: string;
  foreman: string | null;
  leakNumber: string;
  taskNumber: string | null;
  locusviewNumber: string | null;
  address: string | null;
  lineItem: string | null;
  lineItemDescription: string | null;
  crew: { name: string; position: string; hours: number }[];
  description: string | null;
};

export type PdfProject = { name: string; projectNumber: string | null; customer: string | null; location: string | null };

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

const fmtHours = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

// A client-ready backup document: no costs, rates or internal notes, just what
// was done, by whom, and for how many hours.
export async function buildDailyLogsPdf(project: PdfProject, logs: PdfLog[], rangeLabel: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  w.text("Daily Log Report", { size: 20, bold: true });
  w.text(project.projectNumber ? `${project.projectNumber} - ${project.name}` : project.name, { size: 13, bold: true });
  if (project.customer) w.text(`Customer: ${project.customer}`);
  if (project.location) w.text(`Location: ${project.location}`);
  w.text(`${rangeLabel}  -  ${logs.length} daily log${logs.length === 1 ? "" : "s"}`, { color: [0.4, 0.4, 0.4] });
  w.text("Feliciana Welders, Inc.", { color: [0.4, 0.4, 0.4] });
  w.gap(8);

  const grandHours = logs.reduce((n, l) => n + l.crew.reduce((m, c) => m + (Number(c.hours) || 0), 0), 0);

  for (const l of logs) {
    w.ensure(110);
    w.rule();
    w.text(fmtDate(l.date), { size: 13, bold: true });
    const refs = [
      l.foreman ? `Foreman: ${l.foreman}` : null,
      l.leakNumber && l.leakNumber !== "N/A" ? `Leak #: ${l.leakNumber}` : null,
      l.taskNumber ? `Task #: ${l.taskNumber}` : null,
      l.locusviewNumber ? `Locusview #: ${l.locusviewNumber}` : null,
    ].filter(Boolean);
    if (refs.length) w.text(refs.join("     "));
    if (l.address) w.text(`Address: ${l.address}`);
    if (l.lineItem) w.text(`Line item: ${l.lineItem}${l.lineItemDescription ? ` - ${l.lineItemDescription}` : ""}`);
    w.gap(4);

    w.text("Work performed", { bold: true });
    w.text(l.description || "-", { indent: 8 });
    w.gap(4);

    if (l.crew.length) {
      w.text("Crew", { bold: true });
      for (const c of l.crew) w.row(`${c.name}  (${c.position})`, `${fmtHours(Number(c.hours) || 0)} hrs`, { indent: 8 });
      const dayHours = l.crew.reduce((m, c) => m + (Number(c.hours) || 0), 0);
      w.row("Total crew hours", `${fmtHours(dayHours)} hrs`, { bold: true, indent: 8 });
    }
    w.gap(8);
  }

  w.rule();
  w.row("Total crew hours, all logs", `${fmtHours(grandHours)} hrs`, { bold: true });

  addPageNumbers(doc, font, project.projectNumber ? `${project.projectNumber} - ${project.name}` : project.name);
  return doc.save();
}
