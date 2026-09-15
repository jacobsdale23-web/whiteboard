// Replaces the generic CSI divisions in the old spreadsheet template with
// the company's actual scope of work.
export const BID_CATEGORIES = [
  "Mobilization / General Conditions",
  "Excavation & Trenching",
  "Heavy Equipment",
  "Directional Boring",
  "Steel Pipe Welding",
  "Plastic Pipe Fusion (PE)",
  "Pipe & Materials",
  "Traffic Control",
  "Restoration / Site Cleanup",
  "Testing & Tie-Ins",
  "General Labor",
  "Subcontractor / Other",
];

export type BidItemRow = { qty: number | string; unitPrice: number | string };

export function bidItemTotal(item: BidItemRow): number {
  return (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
}

export function directCostSubtotal(items: BidItemRow[]): number {
  return round2(items.reduce((sum, i) => sum + bidItemTotal(i), 0));
}

export type MarkupInput = {
  overheadPercent: number | string;
  profitPercent: number | string;
  contingencyPercent: number | string;
  salesTaxPercent: number | string;
  bondInsuranceCost: number | string;
};

export type EstimateSummary = {
  directCost: number;
  overheadAmount: number;
  profitAmount: number;
  contingencyAmount: number;
  bondInsuranceCost: number;
  costBeforeTax: number;
  salesTaxAmount: number;
  totalBidPrice: number;
};

// Mirrors the "Bid Summary" sheet math from the company's existing
// spreadsheet template: overhead/profit/contingency are percentages of
// direct cost; bond/insurance is a flat dollar amount added pre-tax; sales
// tax applies to everything before it.
export function computeEstimateSummary(items: BidItemRow[], markup: MarkupInput): EstimateSummary {
  const directCost = directCostSubtotal(items);
  const overheadAmount = round2(directCost * (Number(markup.overheadPercent) || 0) / 100);
  const profitAmount = round2(directCost * (Number(markup.profitPercent) || 0) / 100);
  const contingencyAmount = round2(directCost * (Number(markup.contingencyPercent) || 0) / 100);
  const bondInsuranceCost = round2(Number(markup.bondInsuranceCost) || 0);
  const costBeforeTax = round2(directCost + overheadAmount + profitAmount + contingencyAmount + bondInsuranceCost);
  const salesTaxAmount = round2(costBeforeTax * (Number(markup.salesTaxPercent) || 0) / 100);
  const totalBidPrice = round2(costBeforeTax + salesTaxAmount);

  return { directCost, overheadAmount, profitAmount, contingencyAmount, bondInsuranceCost, costBeforeTax, salesTaxAmount, totalBidPrice };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
