export type DailyLogRow = {
  id: string;
  date: string;
  leakNumber: string;
  taskNumber: string | null;
  locusviewNumber: string | null;
  address: string | null;
  crew: { name: string; position: string; hours: number }[] | null;
};

export type BillingRateRow = { position: string; hourlyRate: string | number };

export type TmLineItem = {
  date: string;
  crewMember: string;
  position: string;
  leakNumber: string;
  locusviewNumber: string;
  address: string;
  hours: number;
  rate: number;
  amount: number;
};

// Pulls every crew-member-hour that falls under one recurring Atmos task
// number within a billing period, priced at the project's per-position
// rate. One daily log with N crew members becomes N line items.
export function buildInvoiceLineItems(
  logs: DailyLogRow[],
  rates: BillingRateRow[],
  taskNumber: string,
  periodStart: string,
  periodEnd: string
): TmLineItem[] {
  const rateByPosition = new Map(rates.map((r) => [r.position, Number(r.hourlyRate)]));
  const items: TmLineItem[] = [];

  for (const log of logs) {
    if (log.taskNumber !== taskNumber) continue;
    if (log.date < periodStart || log.date > periodEnd) continue;
    for (const member of log.crew || []) {
      const rate = rateByPosition.get(member.position) ?? 0;
      const hours = Number(member.hours) || 0;
      items.push({
        date: log.date,
        crewMember: member.name,
        position: member.position,
        leakNumber: log.leakNumber,
        locusviewNumber: log.locusviewNumber || "",
        address: log.address || "",
        hours,
        rate,
        amount: Math.round(hours * rate * 100) / 100,
      });
    }
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.crewMember.localeCompare(b.crewMember));
}

export function sumLineItems(items: TmLineItem[]): number {
  return Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
}
