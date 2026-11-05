// What kind of job a project is, for the tap division. A normal job is "standard". A hot tap is billed on its own,
// like a quick job. An FWI hot tap is the tap crew doing a tap for one of our own jobs: it is never billed by itself,
// it goes on the invoice of the job it was done for ("billed through").

export const JOB_KINDS = ["standard", "hot_tap", "fwi_hot_tap"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  standard: "Standard job",
  hot_tap: "Hot tap",
  fwi_hot_tap: "FWI hot tap",
};

export const JOB_KIND_HINTS: Record<JobKind, string> = {
  standard: "",
  hot_tap: "A tap job billed on its own, like a quick job.",
  fwi_hot_tap: "The tap crew tapping for one of our own jobs. It is not billed separately: it is billed through that job.",
};

// Their own colors on the timeline and calendar; standard jobs keep the status colors.
export const JOB_KIND_COLORS: Record<JobKind, string | null> = {
  standard: null,
  hot_tap: "#7a4fb3",
  fwi_hot_tap: "#c2418a",
};

export function cleanJobKind(v: unknown): JobKind {
  return (JOB_KINDS as readonly string[]).includes(v as string) ? (v as JobKind) : "standard";
}

export const isTapKind = (kind: unknown) => cleanJobKind(kind) !== "standard";

// Opportunity types that are tap jobs, so winning one starts a project of the right kind.
export const OPP_TYPE_HOT_TAP = "Hot Tap";
export const OPP_TYPE_FWI_HOT_TAP = "FWI Hot Tap";

export function jobKindFromOppType(oppType: string | null | undefined): JobKind {
  if (oppType === OPP_TYPE_HOT_TAP) return "hot_tap";
  if (oppType === OPP_TYPE_FWI_HOT_TAP) return "fwi_hot_tap";
  return "standard";
}

export function oppTypeColor(oppType: string | null | undefined): string | null {
  return JOB_KIND_COLORS[jobKindFromOppType(oppType)];
}
