// One task's week can be billed as more than one invoice (one per job site / city). These pure helpers pick a site's
// lines and make sure no one's hours are ever billed twice.
import type { TmLineItem } from "@/lib/tm-billing";
import { siteKey } from "@/lib/qb-invoice";

// `onlySite`: set on every line of an invoice made for one job site, so refreshing it stays on that site.
export type SitedLine = TmLineItem & { onlySite?: string };

export const invoiceSite = (lines: SitedLine[] | null | undefined): string | undefined => (lines || []).find((l) => l.onlySite)?.onlySite;

const person = (l: TmLineItem) => `${l.date}|${l.crewMember.trim().toLowerCase()}`;
const row = (l: TmLineItem) => `${person(l)}|${siteKey(l.address)}`;

// Splits lines built from the daily logs into those still to be billed and those already on another invoice. A line
// counts as billed when another invoice has that person, day and job site. If an invoiced line no longer matches any
// log (its address was edited afterwards), that person's whole day is treated as billed, to be safe.
export function splitBilled(all: TmLineItem[], billed: TmLineItem[]): { open: TmLineItem[]; taken: TmLineItem[] } {
  const current = new Set(all.map(row));
  const billedRows = new Set(billed.map(row));
  const blockedDays = new Set(billed.filter((b) => !current.has(row(b))).map(person));
  const open: TmLineItem[] = [];
  const taken: TmLineItem[] = [];
  for (const l of all) (billedRows.has(row(l)) || blockedDays.has(person(l)) ? taken : open).push(l);
  return { open, taken };
}

// The chosen job site's lines (all of them when no site is chosen), marked so the invoice remembers its site.
export function forSite(lines: TmLineItem[], site: string | undefined): SitedLine[] {
  if (!site) return lines;
  return lines.filter((l) => siteKey(l.address) === siteKey(site)).map((l) => ({ ...l, onlySite: site }));
}
