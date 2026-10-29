// A screening flag on a T&M invoice is identified by what it says and who/when it is about, so a flag marked
// "not a mistake" stays marked when the invoice is refreshed from the daily logs and the same flag comes back.
export type FlagLike = { type: string; date: string; crewMember: string; message: string };

export function warningKey(w: FlagLike): string {
  return [w.type, w.date, w.crewMember, w.message].join("|");
}

export type Acknowledgement = { key: string; note: string; at: string };
