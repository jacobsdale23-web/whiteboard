// Spots the "random" mistakes in weekly T&M invoice data that the basic
// screening (blank fields, impossible shifts, crew overlaps) can't see:
// abbreviated names, stray punctuation in Locusview numbers, one job spelled
// two ways, a person listed under two positions, and so on. Everything here
// is advisory: it highlights what to double-check and never changes an amount.

export type QualityField = "crewMember" | "position" | "leakNumber" | "locusviewNumber" | "address" | "hours" | "description";

export type QualityItem = {
  date: string;
  crewMember: string;
  position: string;
  leakNumber: string;
  locusviewNumber: string;
  address: string;
  hours: number;
};

// `value` is what the cell contains, so only that exact cell is highlighted
// (the same crew can work two jobs on one day and only one has the problem).
export type CellRef = { date: string; crewMember: string; field: QualityField; value: string };

export type QualityWarning = {
  severity: "warning";
  type: string;
  message: string;
  date: string;
  crewMember: string;
  cells: CellRef[];
};

const WORD = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}
const datesOf = (items: { date: string }[]) => [...new Set(items.map((i) => i.date))].sort().map(shortDate).join(", ");

function group<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    m.set(k, [...(m.get(k) || []), it]);
  }
  return m;
}

function warn(type: string, message: string, items: QualityItem[], field: QualityField): QualityWarning {
  return {
    severity: "warning",
    type,
    message,
    date: items[0]?.date ?? "",
    crewMember: items[0]?.crewMember ?? "",
    cells: items.map((i) => ({ date: i.date, crewMember: i.crewMember, field, value: cellValue(i, field) })),
  };
}

// What a flagged cell holds. A missing description is matched by position, not text.
export function cellValue(item: QualityItem, field: QualityField): string {
  return field === "description" ? "" : String(item[field] ?? "");
}

// "Dalton C" or just "Jose": the last name was cut short or left off.
function isAbbreviatedName(name: string): boolean {
  const parts = WORD(name);
  if (parts.length < 2) return true;
  return parts[parts.length - 1].replace(/\./g, "").length <= 1;
}

function suggestFullName(name: string, known: string[]): string | null {
  const parts = WORD(name);
  const first = parts[0]?.toLowerCase();
  const initial = parts.length > 1 ? parts[parts.length - 1].replace(/\./g, "").toLowerCase() : "";
  const hits = [...new Set(known)].filter((k) => {
    const kp = WORD(k);
    if (kp.length < 2 || isAbbreviatedName(k)) return false;
    return kp[0].toLowerCase() === first && (!initial || kp[kp.length - 1].toLowerCase().startsWith(initial));
  });
  return hits.length === 1 ? hits[0] : null;
}

// The shape of an id: letters -> A, digits -> 9, anything else kept as is.
const shapeOf = (s: string) => s.replace(/[A-Za-z]+/g, (m) => "A".repeat(m.length)).replace(/\d+/g, (m) => "9".repeat(m.length));

// What is different about a value compared with the usual format.
function describeFormatProblem(value: string, usual: string, example: string): string {
  const trimmed = value.trim();
  const trailing = trimmed.match(/[^A-Za-z0-9]+$/)?.[0];
  const leading = trimmed.match(/^[^A-Za-z0-9]+/)?.[0];
  if (value !== trimmed) return "has a space at the start or end";
  if (trailing) return trailing === "." ? "ends with a period" : `ends with "${trailing}"`;
  if (leading) return `starts with "${leading}"`;
  if (/\s|[-_/]/.test(trimmed)) return "has a space or dash inside it";
  const letters = trimmed.match(/^[A-Za-z]+/)?.[0] ?? "";
  const usualLetters = example.match(/^[A-Za-z]+/)?.[0] ?? "";
  if (letters && usualLetters && letters.toLowerCase() === usualLetters.toLowerCase() && letters !== usualLetters) return "uses different upper/lower case";
  const digits = trimmed.replace(/\D/g, "").length;
  const usualDigits = usual.replace(/[^9]/g, "").length;
  if (digits !== usualDigits) return `has ${digits} digits (the others have ${usualDigits})`;
  return "doesn't match the format of the others";
}

// Flags values that don't look like the rest of the column (e.g. "La691336."
// among "La690861"-style numbers). Needs enough data to know what "usual" is.
function formatOutliers(items: QualityItem[], field: "locusviewNumber" | "leakNumber", label: string, skip: (v: string) => boolean): QualityWarning[] {
  const withValue = items.filter((i) => i[field].trim() && !skip(i[field].trim()));
  if (withValue.length < 4) return [];
  const byShape = group(withValue, (i) => shapeOf(i[field].trim()));
  const [usualShape, usualItems] = [...byShape.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (usualItems.length < 3 || usualItems.length / withValue.length < 0.5) return [];
  const example = usualItems[0][field].trim();

  const out: QualityWarning[] = [];
  const bad = group(
    withValue.filter((i) => i[field] !== i[field].trim() || shapeOf(i[field].trim()) !== usualShape),
    (i) => i[field]
  );
  for (const [value, rows] of bad) {
    out.push(warn("format", `${label} "${value}" (${datesOf(rows)}) ${describeFormatProblem(value, usualShape, example)}. Most are like ${example}.`, rows, field));
  }
  return out;
}

export function screenInvoiceQuality(
  items: QualityItem[],
  knownNames: string[],
  descriptionOf: (item: QualityItem) => string
): QualityWarning[] {
  const out: QualityWarning[] = [];
  const namesOnInvoice = [...new Set(items.map((i) => i.crewMember))];
  const known = [...knownNames, ...namesOnInvoice];

  // 1. Names: abbreviated, or written with odd spacing.
  for (const [name, rows] of group(items, (i) => i.crewMember)) {
    if (isAbbreviatedName(name)) {
      const full = suggestFullName(name, known);
      out.push(warn("name_abbreviated", `Crew name "${name}" is abbreviated (${datesOf(rows)})${full ? `. Did you mean ${full}?` : ". Use the full last name."}`, rows, "crewMember"));
    } else if (name !== name.trim() || /\s{2,}/.test(name) || /[.,;:]$/.test(name.trim())) {
      out.push(warn("name_format", `Crew name "${name}" (${datesOf(rows)}) has extra spaces or punctuation.`, rows, "crewMember"));
    }
  }
  // The same person typed two ways (case, spacing or punctuation).
  for (const [, rows] of group(items, (i) => squash(i.crewMember))) {
    const variants = [...new Set(rows.map((r) => r.crewMember))];
    if (variants.length > 1) {
      for (const v of variants.slice(1)) {
        const r = rows.filter((x) => x.crewMember === v);
        out.push(warn("name_variant", `"${v}" (${datesOf(r)}) is the same person as "${variants[0]}" spelled differently.`, r, "crewMember"));
      }
    }
  }

  // 2. Locusview and leak numbers that don't look like the rest.
  out.push(...formatOutliers(items, "locusviewNumber", "Locusview #", () => false));
  out.push(...formatOutliers(items, "leakNumber", "Leak #", (v) => /^n\/?a$/i.test(v)));

  // 3. Addresses: stray spacing/punctuation, and one job spelled two ways.
  for (const [address, rows] of group(items.filter((i) => i.address), (i) => i.address)) {
    if (address !== address.trim() || /\s{2,}/.test(address) || /[.,;]$/.test(address.trim())) {
      out.push(warn("address_format", `Address "${address.trim()}" (${datesOf(rows)}) has extra spaces or punctuation.`, rows, "address"));
    }
  }
  for (const [, rows] of group(items.filter((i) => i.locusviewNumber.trim()), (i) => squash(i.locusviewNumber))) {
    const addrs = [...new Set(rows.map((r) => r.address.trim().replace(/\s+/g, " ").toLowerCase()).filter(Boolean))];
    if (addrs.length > 1) {
      out.push(warn("address_mismatch", `Locusview # ${rows[0].locusviewNumber.trim()} is listed with different addresses: ${[...new Set(rows.map((r) => r.address.trim().replace(/\s+/g, " ")))].join(" / ")}.`, rows, "address"));
    }
  }
  for (const [, rows] of group(items.filter((i) => i.address.trim()), (i) => `${i.date}|${squash(i.address)}`)) {
    const nums = [...new Set(rows.map((r) => r.locusviewNumber.trim()).filter(Boolean))];
    if (nums.length > 1) {
      out.push(warn("locusview_mismatch", `${shortDate(rows[0].date)}: ${rows[0].address.trim()} has more than one Locusview # (${nums.join(", ")}). One may be a typo.`, rows, "locusviewNumber"));
    }
  }

  // 4. A person under two positions on the same invoice.
  for (const [, rows] of group(items, (i) => squash(i.crewMember))) {
    const positions = [...new Set(rows.map((r) => r.position.trim()).filter(Boolean))];
    if (positions.length > 1) {
      out.push(warn("position_mismatch", `${rows[0].crewMember} is listed as ${positions.join(" and ")} (${positions.map((p) => datesOf(rows.filter((r) => r.position.trim() === p))).join(" / ")}). Check which is right.`, rows, "position"));
    }
  }

  // 5. Hours that aren't in quarter-hours, and the same line entered twice.
  for (const row of items) {
    const h = Number(row.hours) || 0;
    if (h > 0 && Math.abs(h * 4 - Math.round(h * 4)) > 1e-6) {
      out.push(warn("hours_odd", `${row.crewMember} on ${shortDate(row.date)}: ${h} hours isn't a quarter-hour amount. Check for a typo.`, [row], "hours"));
    }
  }
  for (const [, rows] of group(items, (i) => `${squash(i.crewMember)}|${i.date}|${squash(i.locusviewNumber)}|${squash(i.leakNumber)}|${squash(i.address)}`)) {
    if (rows.length > 1) out.push(warn("duplicate", `${rows[0].crewMember} appears ${rows.length} times for the same job on ${shortDate(rows[0].date)}. Possible duplicate entry.`, rows, "hours"));
  }

  // 6. A job with no description of the work on its daily log.
  const seenJobs = new Set<string>();
  for (const row of items) {
    const key = `${row.date}|${row.leakNumber}|${row.locusviewNumber}|${row.address}`;
    if (seenJobs.has(key)) continue;
    seenJobs.add(key);
    if (!descriptionOf(row).trim()) {
      const same = items.filter((i) => `${i.date}|${i.leakNumber}|${i.locusviewNumber}|${i.address}` === key);
      out.push(warn("description_missing", `${shortDate(row.date)}${row.locusviewNumber ? ` ${row.locusviewNumber.trim()}` : ""}: the daily log has no description of the work.`, [same[0]], "description"));
    }
  }

  return out;
}

// The foreman's description of the work behind a line item: the log(s) for that
// date, leak, Locusview number and address that the crew member worked on.
export function descriptionFor(
  item: Pick<QualityItem, "date" | "leakNumber" | "locusviewNumber" | "address" | "crewMember">,
  logs: { date: string; leakNumber: string; locusviewNumber: string | null; address: string | null; description: string | null; crew: { name: string }[] | null }[]
): string {
  const sameJob = logs.filter((l) => l.date === item.date && l.leakNumber === item.leakNumber && (l.locusviewNumber || "") === item.locusviewNumber && (l.address || "") === item.address);
  const withCrew = sameJob.filter((l) => (l.crew || []).some((c) => c.name === item.crewMember));
  const matches = withCrew.length ? withCrew : sameJob;
  return [...new Set(matches.map((l) => (l.description || "").trim()).filter(Boolean))].join("\n\n");
}
