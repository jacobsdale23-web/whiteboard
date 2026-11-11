import { createHash } from "node:crypto";
import type { Charge } from "@/lib/receipt-match";

// Parsing a Capital One transaction export (CSV). Pure: no database or network.

export type StatementLine = { key: string; date: string; description: string; card: string; amount: number; credit: boolean };

// A small CSV reader that understands quoted fields (commas and doubled quotes inside quotes).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

function isoDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

function money(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.replace(/[$,\s]/g, "");
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t);
  const n = Number(t.replace(/[()]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const norm = (h: string) => h.trim().toLowerCase().replace(/[^a-z]+/g, " ").trim();

export type ParsedStatement = { lines: StatementLine[]; problems: string[] };

// Handles Capital One's export columns: Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit.
// A single signed "Amount" column also works (the sign that most rows share is taken to be a charge).
export function parseCardCsv(text: string): ParsedStatement {
  const rows = parseCsv(text);
  const problems: string[] = [];
  const headerIdx = rows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /(description|merchant|debit|amount)/i.test(c)));
  if (headerIdx < 0) return { lines: [], problems: ["I couldn't find the header row. Export the transactions from Capital One as CSV and upload that file."] };
  const head = rows[headerIdx].map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const dateCol = col("transaction date", "trans date", "date", "posted date");
  const descCol = col("description", "merchant", "name");
  const cardCol = col("card no", "card number", "card");
  const debitCol = col("debit");
  const creditCol = col("credit");
  const amountCol = col("amount");
  if (dateCol < 0 || descCol < 0 || (debitCol < 0 && amountCol < 0)) return { lines: [], problems: ["That file doesn't have date, description and amount columns I recognize."] };

  const raw: { date: string; desc: string; card: string; amount: number; credit: boolean }[] = [];
  const body = rows.slice(headerIdx + 1);
  let negatives = 0;
  let positives = 0;
  if (debitCol < 0) for (const r of body) { const a = money(r[amountCol]); if (a != null) a < 0 ? negatives++ : positives++; }
  const chargesAreNegative = negatives > positives;
  for (const r of body) {
    const date = isoDate(r[dateCol] || "");
    if (!date) continue;
    let amount: number;
    let credit = false;
    if (debitCol >= 0) {
      const d = money(r[debitCol]);
      const c = creditCol >= 0 ? money(r[creditCol]) : null;
      if (d != null && d !== 0) amount = Math.abs(d);
      else if (c != null && c !== 0) {
        amount = Math.abs(c);
        credit = true;
      } else continue;
    } else {
      const a = money(r[amountCol]);
      if (a == null || a === 0) continue;
      credit = chargesAreNegative ? a > 0 : a < 0;
      amount = Math.abs(a);
    }
    raw.push({ date, desc: (r[descCol] || "").trim(), card: cardCol >= 0 ? (r[cardCol] || "").trim() : "", amount, credit });
  }
  if (!raw.length) problems.push("I found the columns but no transactions in that file.");

  // Stable keys so the same statement uploaded twice gives the same ids: identical rows are told apart by their order.
  const seen = new Map<string, number>();
  const lines = raw.map((l) => {
    const base = `${l.date}|${l.amount.toFixed(2)}|${l.credit ? "c" : "d"}|${l.desc.toLowerCase()}|${l.card}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return { key: "csv:" + createHash("sha1").update(`${base}|${n}`).digest("hex").slice(0, 16), date: l.date, description: l.desc, card: l.card, amount: l.amount, credit: l.credit };
  });
  return { lines, problems };
}

// The statement as the charge list the matcher works on (credits and payments are kept out of matching).
export function statementCharges(lines: StatementLine[]): Charge[] {
  return lines.map((l) => ({ id: l.key, date: l.date, amount: l.amount, vendor: l.description, memo: "", coded: false, credit: l.credit }));
}
