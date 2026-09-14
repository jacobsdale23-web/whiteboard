export type SovItemRow = {
  itemNo: string;
  description: string | null;
  bidQty: string | number;
  unitPrice: string | number;
  baselineQty: string | number;
};
export type SovEntryRow = { itemNo: string; payAppId: string; periodQty: string | number; stored: string | number };
export type PayAppRow = { id: string; appNumber: string; retainagePercent: string | number };

export type ItemStats = {
  itemNo: string;
  description: string;
  bidQty: number;
  unitPrice: number;
  bidValue: number;
  prev: number;
  thisQty: number;
  cumQty: number;
  cumValue: number;
  storedVal: number;
  totalCompleted: number;
  pct: number;
  balance: number;
};

export function sortedPayApps<T extends PayAppRow>(payApps: T[]): T[] {
  return payApps.slice().sort((a, b) => Number(a.appNumber) - Number(b.appNumber));
}

export function itemStatsAt(item: SovItemRow, entries: SovEntryRow[], payAppsOrdered: PayAppRow[], index: number): ItemStats {
  const itemEntries = entries.filter((e) => e.itemNo === item.itemNo);
  let prev = Number(item.baselineQty) || 0;
  for (let i = 0; i < index; i++) {
    const e = itemEntries.find((x) => x.payAppId === payAppsOrdered[i].id);
    if (e) prev += Number(e.periodQty) || 0;
  }
  const current = itemEntries.find((x) => x.payAppId === payAppsOrdered[index].id);
  const thisQty = current ? Number(current.periodQty) || 0 : 0;
  const storedVal = current ? Number(current.stored) || 0 : 0;
  const cumQty = prev + thisQty;
  const unitPrice = Number(item.unitPrice) || 0;
  const bidQty = Number(item.bidQty) || 0;
  const bidValue = bidQty * unitPrice;
  const cumValue = cumQty * unitPrice;
  const totalCompleted = cumValue + storedVal;
  const pct = bidValue ? totalCompleted / bidValue : 0;
  const balance = bidValue - totalCompleted;
  return {
    itemNo: item.itemNo,
    description: item.description || "",
    bidQty,
    unitPrice,
    bidValue,
    prev,
    thisQty,
    cumQty,
    cumValue,
    storedVal,
    totalCompleted,
    pct,
    balance,
  };
}

export function rollupAt(items: SovItemRow[], entries: SovEntryRow[], payAppsOrdered: PayAppRow[], index: number) {
  let contractPrice = 0;
  let totalCompleted = 0;
  for (const item of items) {
    const s = itemStatsAt(item, entries, payAppsOrdered, index);
    contractPrice += s.bidValue;
    totalCompleted += s.totalCompleted;
  }
  const retainagePct = (Number(payAppsOrdered[index].retainagePercent) || 0) / 100;
  const retainage = totalCompleted * retainagePct;
  const amountEligible = totalCompleted - retainage;
  let prevEligible = 0;
  if (index > 0) {
    let prevCompleted = 0;
    for (const item of items) prevCompleted += itemStatsAt(item, entries, payAppsOrdered, index - 1).totalCompleted;
    const prevRetainagePct = (Number(payAppsOrdered[index - 1].retainagePercent) || 0) / 100;
    prevEligible = prevCompleted - prevCompleted * prevRetainagePct;
  }
  return {
    contractPrice,
    totalCompleted,
    retainage,
    amountEligible,
    amountDue: amountEligible - prevEligible,
    balanceToFinish: contractPrice - totalCompleted,
    pctComplete: contractPrice ? totalCompleted / contractPrice : 0,
  };
}
