// The welder / crew schedule: one row = one person on one job for a run of days. Pure, so it can be checked without a database.

export type SchedRow = {
  id: string;
  projectId: string;
  person: string;
  startDate: string;
  endDate: string;
  location: string | null;
  taskNumber: string | null;
  note: string | null;
};

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const clean = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ");

export type SchedInput = { person: string; startDate: string; endDate: string; location: string; taskNumber: string; note: string };

export function cleanScheduleInput(f: SchedInput): { value: { person: string; startDate: string; endDate: string; location: string | null; taskNumber: string | null; note: string | null } } | { error: string } {
  const person = clean(f.person);
  if (!person) return { error: "Pick who is going." };
  const startDate = clean(f.startDate);
  const endDate = clean(f.endDate) || startDate;
  if (!isDate(startDate)) return { error: "Enter the first day." };
  if (!isDate(endDate)) return { error: "The last day isn't a valid date." };
  if (endDate < startDate) return { error: "The last day is before the first day." };
  if (Date.parse(endDate) - Date.parse(startDate) > 120 * 86400000) return { error: "That is more than four months. Split it into shorter stints." };
  return {
    value: {
      person,
      startDate,
      endDate,
      location: clean(f.location).slice(0, 200) || null,
      taskNumber: clean(f.taskNumber).slice(0, 60) || null,
      note: clean(f.note).slice(0, 300) || null,
    },
  };
}

// YYYY-MM-DD arithmetic in UTC, so daylight saving never shifts a day.
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);

export function mondayOf(iso: string): string {
  const dow = new Date(Date.parse(iso)).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((dow + 6) % 7));
}

export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export const coversDay = (r: { startDate: string; endDate: string }, day: string) => r.startDate <= day && day <= r.endDate;

const overlaps = (a: SchedRow, b: SchedRow) => a.startDate <= b.endDate && b.startDate <= a.endDate;
const key = (s: string) => clean(s).toLowerCase();

// Rows that put the same person in two places on the same day. Returns, per row id, the other rows it clashes with.
// Two rows on the SAME job are not a clash (a person can have a morning and afternoon location noted twice), only different jobs.
export function findConflicts(rows: SchedRow[]): Map<string, SchedRow[]> {
  const out = new Map<string, SchedRow[]>();
  const byPerson = new Map<string, SchedRow[]>();
  for (const r of rows) byPerson.set(key(r.person), [...(byPerson.get(key(r.person)) || []), r]);
  for (const list of byPerson.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.projectId !== b.projectId && overlaps(a, b)) {
          out.set(a.id, [...(out.get(a.id) || []), b]);
          out.set(b.id, [...(out.get(b.id) || []), a]);
        }
      }
    }
  }
  return out;
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
}

export const rangeLabel = (r: { startDate: string; endDate: string }) => (r.startDate === r.endDate ? shortDate(r.startDate) : `${shortDate(r.startDate)} to ${shortDate(r.endDate)}`);

// The people scheduled on one job from `fromIso` onward (and, if given, starting on or before `toIso`), soonest first.
export function crewFor(rows: SchedRow[], projectId: string, fromIso: string, toIso?: string): SchedRow[] {
  return rows
    .filter((r) => r.projectId === projectId && r.endDate >= fromIso && (!toIso || r.startDate <= toIso))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.person.localeCompare(b.person));
}

// One line per stint, for a hover or tooltip: "Benjamin Nelson · 11/9/26 to 11/13/26 · Cleveland, MS".
export const crewLine = (r: SchedRow) => [r.person, rangeLabel(r), r.location].filter(Boolean).join(" · ");
