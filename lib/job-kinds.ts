// What kind of job a project is. A normal job is "standard". A quick job is a small job billed from a quote. For the tap
// division: a hot tap is billed on its own, like a quick job. An FWI hot tap is the tap crew doing a tap for one of our
// own jobs: it is never billed by itself, it goes on the invoice of the job it was done for ("billed through").

export const JOB_KINDS = ["standard", "quick", "hot_tap", "fwi_hot_tap"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  standard: "Standard job",
  quick: "Quick job",
  hot_tap: "Hot tap",
  fwi_hot_tap: "FWI hot tap",
};

export const JOB_KIND_HINTS: Record<JobKind, string> = {
  standard: "",
  quick: "A small job billed from a quote, in and out fast.",
  hot_tap: "A tap job billed on its own, like a quick job.",
  fwi_hot_tap: "The tap crew tapping for one of our own jobs. It is not billed separately: it is billed through that job.",
};

// Their own colors on the timeline and calendar; standard and quick jobs keep the status colors.
export const JOB_KIND_COLORS: Record<JobKind, string | null> = {
  standard: null,
  quick: null,
  hot_tap: "#7a4fb3",
  fwi_hot_tap: "#c2418a",
};

export function cleanJobKind(v: unknown): JobKind {
  return (JOB_KINDS as readonly string[]).includes(v as string) ? (v as JobKind) : "standard";
}

export const isTapKind = (kind: unknown) => cleanJobKind(kind) === "hot_tap" || cleanJobKind(kind) === "fwi_hot_tap";

// The calendar's job filters. Pick any combination: a job shows if it fits ANY picked filter; none picked shows everything.
export const KIND_FILTERS = [
  { value: "taps", label: "Hot tap crew" },
  { value: "quick", label: "Quick jobs" },
  { value: "tm", label: "T&M" },
] as const;
export type KindFilter = (typeof KIND_FILTERS)[number]["value"];

// What was remembered on this device ("taps,tm"). Older single choices (hot_tap, fwi_hot_tap) become the tap crew filter.
export function cleanKindFilters(v: unknown): KindFilter[] {
  const out = new Set<KindFilter>();
  for (const part of String(v ?? "").split(",")) {
    const p = part.trim();
    if (p === "hot_tap" || p === "fwi_hot_tap") out.add("taps");
    else if (KIND_FILTERS.some((f) => f.value === p)) out.add(p as KindFilter);
  }
  return [...out];
}

export function matchesKindFilters(selected: KindFilter[], job: { jobKind?: string | null; billingType?: string | null }): boolean {
  if (!selected.length) return true;
  const k = cleanJobKind(job.jobKind);
  return selected.some((f) => (f === "taps" ? isTapKind(k) : f === "quick" ? k === "quick" : job.billingType === "tm"));
}

// Opportunity types that start a job of a particular kind (or billing type) when won.
export const OPP_TYPE_HOT_TAP = "Hot Tap";
export const OPP_TYPE_FWI_HOT_TAP = "FWI Hot Tap";
export const OPP_TYPE_QUICK = "Quick Job";
export const TM_OPP_TYPES = ["T&M Job", "T&M (Atmos)"];

export function jobKindFromOppType(oppType: string | null | undefined): JobKind {
  if (oppType === OPP_TYPE_HOT_TAP) return "hot_tap";
  if (oppType === OPP_TYPE_FWI_HOT_TAP) return "fwi_hot_tap";
  if (oppType === OPP_TYPE_QUICK) return "quick";
  return "standard";
}

export const billingTypeFromOppType = (oppType: string | null | undefined) => (TM_OPP_TYPES.includes(oppType || "") ? "tm" : "lump_sum");

export function oppTypeColor(oppType: string | null | undefined): string | null {
  return JOB_KIND_COLORS[jobKindFromOppType(oppType)];
}
