// O&M field report: one form whose sections depend on the kind of job. The same definitions drive the on-screen
// form, what gets saved (cleanOmData drops anything not on the form) and the PDF, so they can't drift apart.

export type OmFieldType = "text" | "number" | "date" | "time" | "textarea" | "choice" | "checks" | "yesno" | "rows";

export type OmField = {
  key: string;
  label: string;
  type: OmFieldType;
  options?: string[]; // choice, checks
  columns?: { key: string; label: string }[]; // rows
  wide?: boolean; // takes the full width (otherwise two fields share a line)
  showIf?: { key: string; equals: string }; // only asked when another answer is this
  officeOnly?: boolean; // only admins fill it in
  placeholder?: string;
};

export type OmSection = { id: string; title: string; hint?: string; fields: OmField[] };

export type OmValue = string | string[] | Record<string, string>[];
export type OmData = Record<string, OmValue>;

export type OmPhoto = { key: string; caption: string };

export const MAX_OM_PHOTOS = 10;

// Always asked, whatever the job. The date is its own column.
export const OM_HEADER_FIELDS: OmField[] = [
  { key: "area", label: "Area", type: "text", placeholder: "e.g. Livingston" },
  { key: "customerName", label: "Customer name", type: "text" },
  { key: "phone", label: "Phone number", type: "text" },
  { key: "address", label: "Address", type: "text", wide: true },
  { key: "officeJobInfo", label: "Billing info (office only)", type: "text", wide: true, officeOnly: true },
];

const YESNO = ["Yes", "No"];
const CONDITION = ["Good", "Fair", "Poor"];

export const OM_SECTIONS: Record<string, OmSection> = {
  leak: {
    id: "leak",
    title: "Leak information",
    fields: [
      { key: "leakFound", label: "Leak found?", type: "choice", options: ["Leak found", "No leak found"] },
      { key: "grade", label: "Grade of leak", type: "choice", options: ["1", "2", "3"], showIf: { key: "leakFound", equals: "Leak found" } },
      {
        key: "cause",
        label: "Cause of leak",
        type: "choice",
        wide: true,
        options: ["Corrosion", "Excavation", "Incorrect operations", "Natural force", "Pipe weld and joint failure", "Equipment failure", "Outside force", "Other"],
        showIf: { key: "leakFound", equals: "Leak found" },
      },
      { key: "causeOther", label: "Other cause", type: "text", wide: true, showIf: { key: "cause", equals: "Other" } },
    ],
  },
  excavation: {
    id: "excavation",
    title: "Excavation leak: check all that apply",
    hint: "Shown because the cause of the leak is Excavation.",
    fields: [
      {
        key: "notification",
        label: "Notification issues",
        type: "checks",
        wide: true,
        options: [
          "No notification made to the One-Call Center 811",
          "Excavator dug outside area described on ticket",
          "Excavator dug prior to valid start date/time",
          "Excavator dug after valid ticket expired",
          "Excavator provided incorrect notification information",
        ],
      },
      {
        key: "excavationIssues",
        label: "Excavation issues",
        type: "checks",
        wide: true,
        options: [
          "Excavator dug prior to verifying marks by test-hole (POTHOLE)",
          "Excavator failed to maintain clearance after verifying marks",
          "Excavator failed to protect shore/support facilities",
          "Improper back filling practices",
          "Marks faded or not maintained",
          "Improper excavation practice not listed above",
        ],
      },
      {
        key: "locating",
        label: "Locating issues",
        type: "checks",
        wide: true,
        options: [
          "Facility NOT marked due to abandoned facility",
          "Facility NOT marked due to incorrect facility records/maps",
          "Facility NOT marked due to locator error",
          "Facility NOT marked due to NO response from operator/contractor locator",
          "Facility NOT marked due to incomplete marks at damage location",
          "Facility NOT marked due to tracer wire issue",
          "Facility NOT marked due to UNLOCATABLE FACILITY",
          "Facility MARKED inaccurately due to abandoned facility",
          "Facility MARKED inaccurately due to incorrect facility records/maps",
          "Facility MARKED inaccurately due to LOCATOR error",
          "Facility MARKED inaccurately due to tracer wire",
        ],
      },
      {
        key: "rootCause",
        label: "Root cause",
        type: "checks",
        wide: true,
        options: ["Previous damage", "Deteriorated facility", "One Call Center error", "Root cause not listed"],
      },
    ],
  },
  riser: {
    id: "riser",
    title: "Riser check",
    fields: [
      { key: "riserHot", label: "Riser is hot (live gas)?", type: "yesno" },
      { key: "riserCustomerSide", label: "Customer side installed?", type: "yesno" },
    ],
  },
  pipe: {
    id: "pipe",
    title: "Pipe information",
    fields: [
      { key: "pipeKind", label: "Main or service", type: "choice", options: ["Main", "Service"] },
      { key: "exposed", label: "Was the pipe exposed?", type: "yesno" },
      { key: "pipeType", label: "Existing type of pipe", type: "choice", wide: true, options: ["Cast iron", "Steel", "PE", "PVC", "Other"] },
      { key: "pipeTypeOther", label: "Other type", type: "text", showIf: { key: "pipeType", equals: "Other" } },
      { key: "pipeSize", label: "Existing pipe size", type: "text" },
      { key: "conditionPipe", label: "Condition of pipe", type: "choice", options: CONDITION },
      { key: "conditionCoating", label: "Condition of coating", type: "choice", options: CONDITION },
      { key: "internalCorrosion", label: "Evidence of internal corrosion?", type: "yesno" },
      { key: "coupons", label: "Coupons sent in?", type: "yesno" },
      { key: "pipeToSoil", label: "Pipe to soil (volts)", type: "text" },
      { key: "removedFt", label: "Removed (ft)", type: "text" },
      { key: "removedType", label: "Removed type", type: "text" },
      { key: "installedFt", label: "Installed (ft)", type: "text" },
      { key: "installedType", label: "Installed type", type: "text" },
      { key: "batch", label: "Batch number", type: "text" },
      { key: "dr11", label: "DR 11", type: "text" },
      { key: "efv", label: "EFV # (service)", type: "text", showIf: { key: "pipeKind", equals: "Service" } },
    ],
  },
  pressure: {
    id: "pressure",
    title: "Pressure test",
    fields: [
      { key: "psi", label: "Pressure test (PSI)", type: "number" },
      { key: "minutes", label: "Minutes", type: "number" },
      { key: "testDate", label: "Date", type: "date" },
      { key: "testMedium", label: "Test medium", type: "text" },
      { key: "gaugeCertDate", label: "Gauge cert date", type: "date" },
      { key: "chart", label: "Chart?", type: "yesno" },
    ],
  },
  plastic: {
    id: "plastic",
    title: "Plastic components",
    hint: "List every plastic component used with its serial number.",
    fields: [
      {
        key: "components",
        label: "Components used",
        type: "rows",
        wide: true,
        columns: [
          { key: "component", label: "Component" },
          { key: "serial", label: "Serial number" },
        ],
      },
    ],
  },
  meter: {
    id: "meter",
    title: "Meter information",
    fields: [
      { key: "newMeterNumber", label: "New meter number", type: "text" },
      { key: "newMeterReading", label: "New meter reading", type: "text" },
      { key: "newMeterType", label: "New meter type", type: "text" },
      { key: "oldMeterNumber", label: "Old meter number", type: "text" },
      { key: "oldMeterReading", label: "Old meter reading", type: "text" },
      { key: "oldMeterType", label: "Old meter type", type: "text" },
      { key: "meterDate", label: "Date", type: "date" },
      { key: "meterTime", label: "Time", type: "time" },
      { key: "outsideContractor", label: "Outside contractor?", type: "yesno" },
      { key: "contractorName", label: "Name of contractor", type: "text", showIf: { key: "outsideContractor", equals: "Yes" } },
    ],
  },
};

// Order the sections print in, whatever order they were added.
const SECTION_ORDER = ["leak", "excavation", "riser", "pipe", "pressure", "plastic", "meter"];

export const OM_NARRATIVE: OmField = { key: "narrative", label: "Describe what happened and how repairs were made", type: "textarea", wide: true };

export type OmJobType = { id: string; label: string; blurb: string; sections: string[]; preset?: OmData };

export const OM_JOB_TYPES: OmJobType[] = [
  { id: "leak", label: "Gas leak repair", blurb: "Leak details, pipe, pressure test, plastic components", sections: ["leak", "pipe", "pressure", "plastic"] },
  { id: "service", label: "New service", blurb: "Service pipe, pressure test, plastic components, meter", sections: ["pipe", "pressure", "plastic", "meter"], preset: { pipeKind: "Service" } },
  { id: "meter", label: "Meter change", blurb: "Old and new meter", sections: ["meter"] },
  { id: "riser", label: "Riser check / pressure test", blurb: "Riser hot check and pressure test", sections: ["riser", "pressure"] },
  { id: "other", label: "Other maintenance", blurb: "Just the basics; add any section you need", sections: [] },
];

export const omJobType = (id: string) => OM_JOB_TYPES.find((j) => j.id === id);

// Sections that can still be added to this job (excavation is automatic, never added by hand).
export function addableSections(jobTypeId: string, extras: string[]): OmSection[] {
  const jt = omJobType(jobTypeId);
  if (!jt) return [];
  return SECTION_ORDER.filter((id) => id !== "excavation" && !jt.sections.includes(id) && !extras.includes(id)).map((id) => OM_SECTIONS[id]);
}

export function sectionsFor(jobTypeId: string, extras: string[], data: OmData): OmSection[] {
  const jt = omJobType(jobTypeId);
  if (!jt) return [];
  const included = new Set([...jt.sections, ...extras]);
  if (included.has("leak") && data.cause === "Excavation" && data.leakFound === "Leak found") included.add("excavation");
  return SECTION_ORDER.filter((id) => included.has(id)).map((id) => OM_SECTIONS[id]);
}

export function fieldVisible(f: OmField, data: OmData): boolean {
  return !f.showIf || data[f.showIf.key] === f.showIf.equals;
}

// Keeps only what's on this report's form, in the right shape, so a hidden section's leftover answers (or a
// hand-built request) never get saved.
export function cleanOmData(jobTypeId: string, extras: string[], raw: unknown, opts: { isAdmin: boolean }): OmData {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: OmData = {};

  const take = (fields: OmField[]) => {
    for (const f of fields) {
      if (f.officeOnly && !opts.isAdmin) continue;
      if (!fieldVisible(f, out)) continue;
      const v = src[f.key];
      if (f.type === "choice" || f.type === "yesno") {
        const allowed = f.type === "yesno" ? YESNO : f.options!;
        if (typeof v === "string" && allowed.includes(v)) out[f.key] = v;
      } else if (f.type === "checks") {
        if (Array.isArray(v)) {
          const picked = f.options!.filter((o) => v.includes(o));
          if (picked.length) out[f.key] = picked;
        }
      } else if (f.type === "rows") {
        if (Array.isArray(v)) {
          const rows = v
            .slice(0, 30)
            .map((r) => Object.fromEntries(f.columns!.map((c) => [c.key, String((r as Record<string, unknown>)?.[c.key] ?? "").trim().slice(0, 200)])))
            .filter((r) => Object.values(r).some(Boolean));
          if (rows.length) out[f.key] = rows;
        }
      } else if (typeof v === "string") {
        const t = v.trim().slice(0, f.type === "textarea" ? 6000 : 300);
        if (t) out[f.key] = t;
      }
    }
  };

  take(OM_HEADER_FIELDS);
  // Sections are resolved as answers come in: excavation depends on the leak answers.
  const ids = new Set([...(omJobType(jobTypeId)?.sections ?? []), ...extras]);
  for (const id of SECTION_ORDER) {
    if (id === "excavation") {
      if (ids.has("leak") && out.cause === "Excavation" && out.leakFound === "Leak found") take(OM_SECTIONS.excavation.fields);
    } else if (ids.has(id)) take(OM_SECTIONS[id].fields);
  }
  take([OM_NARRATIVE]);
  return out;
}

// Plain-text version of an answer for the report view and the PDF; "" when nothing was answered.
export function formatOmValue(f: OmField, v: OmValue | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "string") return f.type === "date" ? fmtDate(v) : f.type === "time" ? fmtTime(v) : v;
  if (f.type === "rows") return (v as Record<string, string>[]).map((r) => f.columns!.map((c) => r[c.key]).filter(Boolean).join(" - ")).join("\n");
  return (v as string[]).join("\n");
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return t;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export const formatOmDate = fmtDate;
