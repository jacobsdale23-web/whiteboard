import { JOB_KIND_COLORS, JOB_KIND_LABELS, cleanJobKind } from "@/lib/job-kinds";

export type GanttProject = {
  id: string;
  name: string;
  location: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  duration: string | null;
  value: string | number | null;
  crew: string[] | null;
  jobKind?: string | null; // standard | quick | hot_tap | fwi_hot_tap
  billingType?: string | null; // lump_sum | tm, for the calendar's T&M filter
  pm?: string | null; // the project manager, for the calendar's PM filter
};

export type Bar = { start: Date; end: Date; cls: string; estimated: boolean };

const STATUS_COLORS: Record<string, string> = {
  "status-active": "var(--active)",
  "status-upcoming": "var(--upcoming)",
  "status-overdue": "var(--danger)",
  "status-complete": "var(--muted)",
  "status-hold": "var(--hold, #b7791f)",
};

// A tap job shows in its own color while it is active or upcoming. Overdue, on hold and finished jobs keep their status
// color so those warnings are never hidden; the bar's tag (tapTag) still says what kind of job it is.
export function barColor(cls: string, jobKind?: string | null): string {
  const own = JOB_KIND_COLORS[cleanJobKind(jobKind)];
  if (own && (cls === "status-active" || cls === "status-upcoming")) return own;
  return STATUS_COLORS[cls];
}

export function tapTag(jobKind?: string | null): string | null {
  const kind = cleanJobKind(jobKind);
  return kind === "hot_tap" || kind === "fwi_hot_tap" ? JOB_KIND_LABELS[kind] : null;
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

function parseDurationDays(str: string | null): number | null {
  if (!str) return null;
  const m = /(\d+)/.exec(str);
  return m ? parseInt(m[1], 10) : null;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Mirrors the original artifact's bar-placement logic: an active project
// with no known start date is drawn from today to its completion date (or
// from the completion date to today, in "overdue" red, if it's past due).
// An upcoming project's end is estimated from its duration text when no
// explicit end date exists yet.
export function computeBar(p: GanttProject): Bar | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDate(p.startDate);
  let end = parseDate(p.endDate);

  if (p.status === "upcoming") {
    if (!start) return null;
    let estimated = false;
    if (!end) {
      let durDays = parseDurationDays(p.duration);
      if (durDays === null) {
        durDays = 30;
        estimated = true;
      }
      end = addDays(start, durDays);
    }
    return { start, end, cls: "status-upcoming", estimated };
  }
  if (p.status === "active") {
    if (start && end) return { start, end, cls: end < today ? "status-overdue" : "status-active", estimated: false };
    if (!start && end) {
      if (end < today) return { start: end, end: today, cls: "status-overdue", estimated: false };
      return { start: today, end, cls: "status-active", estimated: false };
    }
    if (start && !end) return { start, end: addDays(start, 30), cls: "status-active", estimated: true };
    return null;
  }
  if (p.status === "complete") {
    if (end) return { start: start || addDays(end, -30), end, cls: "status-complete", estimated: !start };
    return null;
  }
  // A paused job stays on the calendar in its own color and is never "overdue":
  // it keeps its place until it is resumed (set back to active).
  if (p.status === "on_hold") {
    if (start && end) return { start, end, cls: "status-hold", estimated: false };
    if (!start && end) return end < today ? { start: end, end: today, cls: "status-hold", estimated: false } : { start: today, end, cls: "status-hold", estimated: false };
    if (start && !end) return { start, end: addDays(start, 30), cls: "status-hold", estimated: true };
    return null;
  }
  // "billed" and "canceled" jobs are finished or dropped: no bar, so they leave the calendar.
  return null;
}
