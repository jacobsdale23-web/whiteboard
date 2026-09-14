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
};

export type Bar = { start: Date; end: Date; cls: string; estimated: boolean };

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
  return null;
}
