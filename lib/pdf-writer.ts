import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN = 48;
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

// pdf-lib's built-in fonts only cover WinAnsi; anything else would throw.
export function clean(s: string): string {
  let out = "";
  for (const ch of s.replace(/\r/g, "")) {
    const c = ch.codePointAt(0)!;
    out += ch === "\n" || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || CP1252_EXTRA.has(ch) ? ch : "?";
  }
  return out;
}

export class Writer {
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
  // Two aligned columns on one line, e.g. a crew member's name and hours.
  row(left: string, right: string, opts: { bold?: boolean; indent?: number; size?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    this.ensure(size + 4);
    this.page.drawText(clean(left), { x: MARGIN + indent, y: this.y - size, size, font, color: rgb(0.1, 0.1, 0.1) });
    const r = clean(right);
    this.page.drawText(r, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(r, size), y: this.y - size, size, font, color: rgb(0.1, 0.1, 0.1) });
    this.y -= size + 4;
  }
  // Pictures two across, each fit inside a box and captioned. A picture that can't be read is skipped.
  async photos(items: { bytes: Uint8Array; caption: string }[], opts: { boxH?: number } = {}) {
    const boxH = opts.boxH ?? 170;
    const gap = 10;
    const boxW = (PAGE_W - MARGIN * 2 - gap) / 2;
    for (let i = 0; i < items.length; i += 2) {
      this.ensure(boxH + 26);
      for (let j = 0; j < 2 && i + j < items.length; j++) {
        const p = items[i + j];
        let img;
        try {
          img = p.bytes[0] === 0x89 && p.bytes[1] === 0x50 ? await this.doc.embedPng(p.bytes) : await this.doc.embedJpg(p.bytes);
        } catch {
          continue;
        }
        const x = MARGIN + j * (boxW + gap);
        const scale = Math.min(boxW / img.width, boxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        this.page.drawImage(img, { x: x + (boxW - w) / 2, y: this.y - h, width: w, height: h });
        if (p.caption) this.page.drawText(clean(p.caption).slice(0, 90), { x, y: this.y - boxH - 10, size: 8, font: this.font, color: rgb(0.1, 0.1, 0.1) });
      }
      this.y -= boxH + 22;
    }
  }
  rule() {
    this.ensure(8);
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 2 }, end: { x: PAGE_W - MARGIN, y: this.y - 2 }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
    this.y -= 8;
  }
}

export function addPageNumbers(doc: PDFDocument, font: PDFFont, leftText = "") {
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`Page ${i + 1} of ${pages.length}`, { x: PAGE_W - MARGIN - 60, y: 24, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
    if (leftText) p.drawText(clean(leftText), { x: MARGIN, y: 24, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  });
}
