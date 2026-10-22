// Shared HR constants and helpers (kept out of "use server" files, which may
// only export async functions).

export const CANDIDATE_STAGES = [
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "pre_hire", label: "Pre-hire (drug test / paperwork)" },
  { value: "hired", label: "Hired" },
  { value: "rejected", label: "Not selected" },
  { value: "withdrawn", label: "Withdrew" },
] as const;
export const OPEN_STAGES = ["applied", "screening", "interview", "offer", "pre_hire"];

export const TEST_TYPES = [
  { value: "pre_employment", label: "Pre-employment" },
  { value: "random", label: "Random" },
  { value: "post_accident", label: "Post-accident" },
  { value: "reasonable_suspicion", label: "Reasonable suspicion" },
  { value: "return_to_duty", label: "Return-to-duty" },
  { value: "follow_up", label: "Follow-up" },
] as const;

export const SUBSTANCES = [
  { value: "both", label: "Drug + alcohol" },
  { value: "drug", label: "Drug" },
  { value: "alcohol", label: "Alcohol" },
] as const;

// "ordered" and "collected" mean we are still waiting on a result.
export const TEST_STATUSES = [
  { value: "ordered", label: "Ordered" },
  { value: "collected", label: "Collected, awaiting result" },
  { value: "negative", label: "Negative (cleared)" },
  { value: "positive", label: "Positive / failed" },
  { value: "refused", label: "Refused" },
  { value: "cancelled", label: "Cancelled" },
] as const;
export const PENDING_STATUSES = ["ordered", "collected"];

export const EMPLOYEE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "leave", label: "On leave" },
  { value: "terminated", label: "Terminated" },
] as const;

export const DA_PROGRAM = [
  { value: "pending", label: "Pending (awaiting negative pre-employment)" },
  { value: "active", label: "Active in program" },
  { value: "inactive", label: "Not in program" },
] as const;

export const HR_UPLOAD_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

// OQ re-evaluation is on a fixed interval; three years is the default and can
// be overridden per qualification.
export const OQ_DEFAULT_YEARS = 3;
export const OQ_WARN_DAYS = 60;

const labelOf = (list: readonly { value: string; label: string }[]) => (v: string) => list.find((x) => x.value === v)?.label ?? v;
export const stageLabel = labelOf(CANDIDATE_STAGES);
export const testTypeLabel = labelOf(TEST_TYPES);
export const substanceLabel = labelOf(SUBSTANCES);
export const testStatusLabel = labelOf(TEST_STATUSES);
export const employeeStatusLabel = labelOf(EMPLOYEE_STATUSES);
export const daProgramLabel = labelOf(DA_PROGRAM);

export const today = () => new Date().toISOString().slice(0, 10);

export function addYears(isoDate: string, years: number): string {
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

export type OqState = "current" | "expiring" | "expired" | "no_expiry";

export function oqState(expiresDate: string | null, now: string = today()): OqState {
  if (!expiresDate) return "no_expiry";
  if (expiresDate < now) return "expired";
  const warn = new Date(now + "T00:00:00");
  warn.setDate(warn.getDate() + OQ_WARN_DAYS);
  return expiresDate <= warn.toISOString().slice(0, 10) ? "expiring" : "current";
}

export type TestLike = { testType: string; status: string; orderedDate: string | null; collectedDate: string | null; resultDate: string | null; createdAt: Date };

const testDate = (t: TestLike) => t.resultDate || t.collectedDate || t.orderedDate || t.createdAt.toISOString().slice(0, 10);

// The most recent test (any type), by date.
export function latestTest<T extends TestLike>(tests: T[]): T | null {
  return tests.slice().sort((a, b) => testDate(b).localeCompare(testDate(a)) || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
}

export type PreEmploymentState = "not_ordered" | "pending" | "cleared" | "failed" | "refused";

// Where a person stands on their pre-employment test: cleared only if the
// latest pre-employment test is negative.
export function preEmploymentState(tests: TestLike[]): PreEmploymentState {
  const pre = latestTest(tests.filter((t) => t.testType === "pre_employment" && t.status !== "cancelled"));
  if (!pre) return "not_ordered";
  if (pre.status === "negative") return "cleared";
  if (pre.status === "positive") return "failed";
  if (pre.status === "refused") return "refused";
  return "pending";
}

export const PRE_EMPLOYMENT_LABEL: Record<PreEmploymentState, string> = {
  not_ordered: "Test not ordered",
  pending: "Test pending",
  cleared: "Cleared (negative)",
  failed: "Failed (positive)",
  refused: "Refused",
};

export const csvCell = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
