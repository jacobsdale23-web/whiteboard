// Meetings are opportunities with a time and, optionally, attendees besides the organizer (the PM / estimator field).
// Pure helpers, shared by the form, the server and the calendar.

export const isMeeting = (o: { kind?: string | null; oppType?: string | null }) => o.kind === "Meeting" || o.oppType === "Meeting";

// "HH:MM" from a time input, or null.
export function cleanMeetingTime(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : null;
}

// Names, trimmed, without blanks or repeats (ignoring capitals). Takes the form's JSON list or an array.
export function cleanAttendees(v: unknown): string[] {
  let list: unknown = v;
  if (typeof v === "string") {
    try {
      list = JSON.parse(v || "[]");
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const name = String(item ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out.slice(0, 50);
}

// "14:30" -> "2:30 PM"
export function formatMeetingTime(time: string | null | undefined): string {
  const t = cleanMeetingTime(time);
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
