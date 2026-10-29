// A screening flag on a T&M invoice is identified by what it says and who/when it is about, so a flag marked
// "not a mistake" stays marked when the invoice is refreshed from the daily logs and the same flag comes back.
export type FlagLike = { type: string; date: string; crewMember: string; message: string };

export function warningKey(w: FlagLike): string {
  return [w.type, w.date, w.crewMember, w.message].join("|");
}

// What kind of problem a flag is, ignoring who and when, so "Mark all like this" can settle a whole week of the
// same thing (say, every line missing a Locusview number) in one click.
export function warningKind(w: FlagLike): string {
  const m = w.message;
  if (w.type === "missing_data") {
    const i = m.indexOf(": missing ");
    if (i >= 0) return `missing_data|${m.slice(i + ": missing ".length)}`;
    if (m.includes("no task number")) return "missing_data|no task number";
  }
  if (w.type === "format") return `format|${m.split('"')[0].trim()}`;
  return w.type;
}

export type Acknowledgement = { key: string; note: string; at: string };
