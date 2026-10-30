import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { addPageNumbers, clean, MARGIN, PAGE_H, PAGE_W } from "@/lib/pdf-writer";
import { OM_LOGO_PNG_BASE64 } from "@/lib/om-logo";
import { OM_HEADER_FIELDS, OM_NARRATIVE, fieldVisible, formatOmDate, formatOmValue, omJobType, sectionsFor, type OmData, type OmField } from "@/lib/om-report";

export type OmPdfReport = {
  date: string;
  jobType: string;
  extras: string[];
  data: OmData;
  technician: string | null;
  signature: string | null;
};
export type OmPdfProject = { name: string; projectNumber: string | null; companyName: string };
export type OmPdfPhoto = { bytes: Uint8Array; caption: string };

const BLUE = rgb(0.74, 0.89, 0.97);
const SHADE = rgb(0.93, 0.93, 0.97);
const INK = rgb(0.1, 0.1, 0.1);
const LINE = rgb(0.3, 0.3, 0.3);
const W = PAGE_W - MARGIN * 2;
const SIZE = 9;
const LEAD = 11.5;
const PAD = 4;

type Cell = { label: string; value: string };

class Sheet {
  page!: PDFPage;
  y = 0;
  constructor(public doc: PDFDocument, public font: PDFFont, public bold: PDFFont) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }
  ensure(h: number) {
    if (this.y - h < MARGIN + 24) this.newPage();
  }
  wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
    const lines: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const test = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) > maxW && line) {
          lines.push(line);
          line = word;
        } else line = test;
      }
      lines.push(line);
    }
    return lines;
  }
  // Light-blue bar with the section title, like the paper form.
  bar(title: string) {
    this.ensure(18 + 40);
    this.page.drawRectangle({ x: MARGIN, y: this.y - 17, width: W, height: 17, color: BLUE, borderColor: LINE, borderWidth: 0.7 });
    const t = clean(title);
    this.page.drawText(t, { x: MARGIN + (W - this.bold.widthOfTextAtSize(t, 10)) / 2, y: this.y - 12, size: 10, font: this.bold, color: INK });
    this.y -= 17;
  }
  // One line of bordered cells, each a shaded label beside its value.
  row(cells: Cell[]) {
    const cw = W / cells.length;
    const labelW = cells.length === 1 ? 150 : cw * 0.42;
    const heights = cells.map((c) => {
      const l = this.wrap(c.label, this.bold, SIZE, labelW - PAD * 2).length;
      const v = this.wrap(c.value, this.font, SIZE, cw - labelW - PAD * 2).length;
      return Math.max(l, v) * LEAD + PAD * 2 - 2;
    });
    const h = Math.max(...heights);
    this.ensure(h);
    cells.forEach((c, i) => {
      const x = MARGIN + i * cw;
      this.page.drawRectangle({ x, y: this.y - h, width: labelW, height: h, color: SHADE, borderColor: LINE, borderWidth: 0.7 });
      this.page.drawRectangle({ x: x + labelW, y: this.y - h, width: cw - labelW, height: h, borderColor: LINE, borderWidth: 0.7 });
      this.wrap(c.label, this.bold, SIZE, labelW - PAD * 2).forEach((ln, j) =>
        this.page.drawText(ln, { x: x + PAD, y: this.y - PAD - SIZE - j * LEAD + 1, size: SIZE, font: this.bold, color: INK })
      );
      this.wrap(c.value, this.font, SIZE, cw - labelW - PAD * 2).forEach((ln, j) =>
        this.page.drawText(ln, { x: x + labelW + PAD, y: this.y - PAD - SIZE - j * LEAD + 1, size: SIZE, font: this.font, color: INK })
      );
    });
    this.y -= h;
  }
  // The answered fields of a section: wide or multi-line ones get a line to themselves, short ones share a line.
  fields(fs: OmField[], data: OmData) {
    const filled = fs.map((f) => ({ f, v: formatOmValue(f, data[f.key]) })).filter((x) => x.v);
    let pending: Cell | null = null;
    for (const { f, v } of filled) {
      const alone = f.wide || f.type === "checks" || f.type === "rows" || f.type === "textarea";
      if (alone) {
        if (pending) {
          this.row([pending]);
          pending = null;
        }
        this.row([{ label: f.label, value: v }]);
      } else if (pending) {
        this.row([pending, { label: f.label, value: v }]);
        pending = null;
      } else pending = { label: f.label, value: v };
    }
    if (pending) this.row([pending]);
  }
  async image(bytes: Uint8Array): Promise<PDFImage | null> {
    try {
      const png = bytes[0] === 0x89 && bytes[1] === 0x50;
      return png ? await this.doc.embedPng(bytes) : await this.doc.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

export async function buildOmReportPdf(project: OmPdfProject, report: OmPdfReport, photos: OmPdfPhoto[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const s = new Sheet(doc, font, bold);
  const jt = omJobType(report.jobType);

  // Logo, title
  const logo = await doc.embedPng(Buffer.from(OM_LOGO_PNG_BASE64, "base64"));
  const lw = 150;
  const lh = (lw * logo.height) / logo.width;
  s.page.drawImage(logo, { x: (PAGE_W - lw) / 2, y: s.y - lh, width: lw, height: lh });
  s.y -= lh + 8;
  const title = "Report";
  s.page.drawText(title, { x: (PAGE_W - bold.widthOfTextAtSize(title, 18)) / 2, y: s.y - 16, size: 18, font: bold, color: INK });
  s.y -= 22;
  const sub = clean(`${jt?.label || ""}${project.projectNumber ? `   |   ${project.projectNumber} - ${project.name}` : `   |   ${project.name}`}`);
  s.page.drawText(sub, { x: (PAGE_W - font.widthOfTextAtSize(sub, 9)) / 2, y: s.y - 9, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  s.y -= 22;

  // Job header
  s.row([
    { label: "Date Performed:", value: formatOmDate(report.date) },
    { label: "Area:", value: String(report.data.area || "") },
  ]);
  s.fields(OM_HEADER_FIELDS.filter((f) => f.key !== "area"), report.data);

  // Only the sections this job used
  for (const sec of sectionsFor(report.jobType, report.extras, report.data)) {
    const fs = sec.fields.filter((f) => fieldVisible(f, report.data));
    if (!fs.some((f) => formatOmValue(f, report.data[f.key]))) continue;
    s.y -= 6;
    s.bar(sec.title);
    s.fields(fs, report.data);
  }

  s.y -= 6;
  s.bar("Describe what happened and how repairs were made");
  s.fields([{ ...OM_NARRATIVE, label: "Work performed" }], report.data);

  // Sign-off
  s.y -= 6;
  s.ensure(17 + 62);
  s.bar("Sign-off");
  const sigImg = report.signature?.startsWith("data:image/png;base64,") ? await s.image(Buffer.from(report.signature.split(",")[1], "base64")) : null;
  const sh = 58;
  s.page.drawRectangle({ x: MARGIN, y: s.y - sh, width: 150, height: sh, color: SHADE, borderColor: LINE, borderWidth: 0.7 });
  s.page.drawRectangle({ x: MARGIN + 150, y: s.y - sh, width: W - 150, height: sh, borderColor: LINE, borderWidth: 0.7 });
  s.page.drawText("Name of Tech:", { x: MARGIN + PAD, y: s.y - PAD - SIZE + 1, size: SIZE, font: bold, color: INK });
  s.page.drawText(clean(report.technician || ""), { x: MARGIN + 150 + PAD, y: s.y - PAD - SIZE + 1, size: SIZE, font, color: INK });
  s.page.drawText("Signature:", { x: MARGIN + PAD, y: s.y - 30, size: SIZE, font: bold, color: INK });
  if (sigImg) {
    const h = 44;
    const w = Math.min((h * sigImg.width) / sigImg.height, 220);
    s.page.drawImage(sigImg, { x: MARGIN + 150 + PAD, y: s.y - sh + 4, width: w, height: (w * sigImg.height) / sigImg.width });
  }
  s.y -= sh;

  // Pictures: two across, each fit inside a box and captioned
  if (photos.length) {
    s.y -= 6;
    s.ensure(17 + 230);
    s.bar("Pictures");
    const boxW = (W - 10) / 2;
    const boxH = 190;
    for (let i = 0; i < photos.length; i += 2) {
      s.y -= 8;
      s.ensure(boxH + 24);
      for (let j = 0; j < 2 && i + j < photos.length; j++) {
        const p = photos[i + j];
        const img = await s.image(p.bytes);
        const x = MARGIN + j * (boxW + 10);
        if (img) {
          const scale = Math.min(boxW / img.width, boxH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          s.page.drawImage(img, { x: x + (boxW - w) / 2, y: s.y - boxH + (boxH - h), width: w, height: h });
        }
        const cap = clean(`Pic ${i + j + 1}${p.caption ? `: ${p.caption}` : ""}`);
        s.wrap(cap, font, 8, boxW).slice(0, 2).forEach((ln, k) => s.page.drawText(ln, { x, y: s.y - boxH - 10 - k * 10, size: 8, font, color: INK }));
      }
      s.y -= boxH + 24;
    }
  }

  addPageNumbers(doc, font, `${project.companyName} - ${project.projectNumber ? `${project.projectNumber} - ` : ""}${project.name}`);
  return doc.save();
}
