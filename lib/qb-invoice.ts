// How an approved White Board T&M invoice becomes an invoice in QuickBooks. White Board keeps one row per person per
// day (the backup Atmos wants); the QuickBooks invoice is the short version: hours by rate, "Hourly Rate Per Man" and
// "Hourly Rate Per Welder", with the Atmos task details on top. Pure, so it can be checked without QuickBooks.

export type TmRow = { position: string; hours: number; rate: number; amount: number };
export type QbLine = { description: string; qty: number; rate: number; amount: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const isWelder = (position: string) => /welder/i.test(position);

type Group = { welder: boolean; rate: number; hours: number; positions: Set<string> };

// Rows grouped by rate: welders on their own line, everyone else under "Per Man". If the non-welders have more than
// one rate, the most-worked rate keeps the plain label and the others name their positions so nothing is hidden.
export function buildQbLines(rows: TmRow[], invoiceTotal: number): { lines: QbLine[] } | { error: string } {
  if (!rows.length) return { error: "This invoice has no lines." };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const welder = isWelder(r.position);
    const k = `${welder ? "W" : "M"}|${r.rate}`;
    const g = groups.get(k) || { welder, rate: r.rate, hours: 0, positions: new Set<string>() };
    g.hours += Number(r.hours) || 0;
    g.positions.add(r.position);
    groups.set(k, g);
  }
  const men = [...groups.values()].filter((g) => !g.welder).sort((a, b) => b.hours - a.hours);
  const welders = [...groups.values()].filter((g) => g.welder).sort((a, b) => b.hours - a.hours);

  const lines: QbLine[] = [];
  men.forEach((g, i) => {
    const qty = round2(g.hours);
    lines.push({ description: i === 0 ? "Hourly Rate Per Man" : `Hourly Rate Per Man - ${[...g.positions].sort().join("/")}`, qty, rate: g.rate, amount: round2(qty * g.rate) });
  });
  welders.forEach((g, i) => {
    const qty = round2(g.hours);
    lines.push({ description: i === 0 ? "Hourly Rate Per Welder" : `Hourly Rate Per Welder - ${g.rate}/hr`, qty, rate: g.rate, amount: round2(qty * g.rate) });
  });

  const sum = round2(lines.reduce((s, l) => s + l.amount, 0));
  if (Math.abs(sum - invoiceTotal) > 0.05) {
    return { error: `The QuickBooks lines add up to $${sum.toFixed(2)} but this invoice totals $${invoiceTotal.toFixed(2)}. Refresh it from the daily logs, or tell Jacob.` };
  }
  return { lines };
}

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}/${y.slice(2)}`;
};

// The message at the top of the QuickBooks invoice (QuickBooks allows 1,000 characters).
export function buildCustomerMemo(task: { taskNumber: string; projectName: string | null; taskRequestNo: string | null; contractCoordinator: string | null } | undefined, periodStart: string, periodEnd: string): string {
  const parts = [
    task?.taskNumber && `Task / Project No.: ${task.taskNumber}`,
    task?.taskRequestNo && `Task Request No.: ${task.taskRequestNo}`,
    task?.contractCoordinator && `Contract Coordinator: ${task.contractCoordinator}`,
    task?.projectName && `Project Name: ${task.projectName}`,
    `Work period: ${shortDate(periodStart)} to ${shortDate(periodEnd)}`,
  ].filter(Boolean) as string[];
  return parts.join("\n").slice(0, 1000);
}
