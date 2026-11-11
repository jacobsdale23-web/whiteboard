// Pure logic for comparing White Board's projects with QuickBooks' jobs, and for choosing the next project number.
// (No database or QuickBooks calls here, so it can be checked on its own.)

export type QbJobLite = { id: string; number: string; name: string; parent: string | null; active: boolean; isProject: boolean | null };
export type WbProjectLite = { id: string; name: string; projectNumber: string | null; status: string; jobKind: string; customer: string | null };

// "26106 - 2\" Service" -> { number: "26106", name: "2\" Service" }. Anything else (an unnumbered job, a plain customer) is null.
const JOB_NAME_RE = /^(\d{5}|\d{2}[A-Za-z]{3,10})\s*-\s*(.*)$/;
export function parseJobName(displayName: string): { number: string; name: string } | null {
  const m = JOB_NAME_RE.exec(displayName.trim());
  return m ? { number: m[1], name: m[2].trim() || m[1] } : null;
}

// QuickBooks numbers the office knows about and has chosen not to add or match (see the twice-weekly check), plus the shop.
export const IGNORED_QB_NUMBERS = new Set(["26006", "26007", "26012", "26013", "26016", "26017", "26019", "26030", "26066", "26098", "26000"]);

const same = (a: string, b: string) => a.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === b.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type QbCheck = {
  qbOnly: QbJobLite[]; // a current-year numbered QuickBooks job White Board doesn't have
  wbNotInQb: WbProjectLite[]; // White Board has a number QuickBooks doesn't
  wbNoNumber: WbProjectLite[]; // an open White Board job with no number yet
  nameDiffs: { wb: WbProjectLite; qb: QbJobLite }[];
  matched: number;
};

// yy is the two-digit year ("26"). QuickBooks jobs from other years aren't expected in White Board, so they are skipped.
// FWI hot taps are billed through another job and never get a number of their own.
export function compareJobs(wb: WbProjectLite[], qb: QbJobLite[], yy: string): QbCheck {
  const qbByNumber = new Map<string, QbJobLite>();
  for (const j of qb) if (!qbByNumber.has(j.number)) qbByNumber.set(j.number, j);
  const wbByNumber = new Map<string, WbProjectLite>();
  for (const p of wb) if (p.projectNumber && !wbByNumber.has(p.projectNumber)) wbByNumber.set(p.projectNumber, p);

  const qbOnly = qb.filter((j) => j.number.startsWith(yy) && j.active && !IGNORED_QB_NUMBERS.has(j.number) && !wbByNumber.has(j.number));
  const wbNotInQb = wb.filter((p) => p.projectNumber && p.jobKind !== "fwi_hot_tap" && !qbByNumber.has(p.projectNumber));
  const wbNoNumber = wb.filter((p) => !p.projectNumber && p.jobKind !== "fwi_hot_tap" && ["upcoming", "active", "on_hold"].includes(p.status));
  const nameDiffs: QbCheck["nameDiffs"] = [];
  let matched = 0;
  for (const p of wb) {
    const j = p.projectNumber ? qbByNumber.get(p.projectNumber) : undefined;
    if (!j) continue;
    matched++;
    if (!same(p.name, j.name)) nameDiffs.push({ wb: p, qb: j });
  }
  return { qbOnly, wbNotInQb, wbNoNumber, nameDiffs, matched };
}

// The next free number: the highest five-digit number for this year across QuickBooks and White Board, plus one.
// Lettered numbers (26TRAIN) and the shop's 26000 never count.
export function nextProjectNumber(yy: string, ...lists: (string | null | undefined)[][]): string {
  let max = Number(`${yy}000`);
  for (const list of lists) {
    for (const n of list) {
      if (n && /^\d{5}$/.test(n) && n.startsWith(yy) && Number(n) > max) max = Number(n);
    }
  }
  return String(max + 1);
}

// QuickBooks names can't contain a colon and are capped at 500 characters.
export const qbSafeName = (s: string) => s.replace(/[:\t\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
