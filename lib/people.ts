import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { crew, foremanCrews } from "@/lib/db/schema";

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const key = (s: string) => clean(s).toLowerCase();

export type People = { names: string[]; usualCrews: Record<string, string[]> };

// Names for the suggestion lists, plus each foreman's usual crew from the last
// three weeks (most frequent first).
export async function getPeople(): Promise<People> {
  const [people, pairs] = await Promise.all([db.select().from(crew), db.select().from(foremanCrews)]);

  const names = people
    .filter((p) => p.active)
    .map((p) => clean(p.name))
    .sort((a, b) => a.localeCompare(b));

  const since = new Date();
  since.setDate(since.getDate() - 21);
  const sinceStr = since.toISOString().slice(0, 10);
  const grouped = new Map<string, { member: string; times: number }[]>();
  for (const p of pairs) {
    if (p.lastSeen < sinceStr) continue;
    const k = key(p.foreman);
    grouped.set(k, [...(grouped.get(k) || []), { member: p.member, times: Number(p.times) }]);
  }
  const usualCrews: Record<string, string[]> = {};
  for (const [k, list] of grouped) {
    usualCrews[k] = list
      .sort((a, b) => b.times - a.times || a.member.localeCompare(b.member))
      .slice(0, 10)
      .map((x) => x.member);
  }
  return { names, usualCrews };
}

// Typing "james lindsay" should save as "James Lindsay" if that person exists,
// so the lists don't fill up with spelling variants. Unknown names are kept as typed.
export async function rememberNames(rawNames: string[]): Promise<Map<string, string>> {
  const existing = await db.select().from(crew);
  const byKey = new Map(existing.map((p) => [key(p.name), clean(p.name)]));
  const resolved = new Map<string, string>();
  for (const raw of rawNames) {
    const name = clean(raw);
    if (!name) continue;
    const found = byKey.get(key(name));
    if (found) {
      resolved.set(raw, found);
      continue;
    }
    // A new hire: add to the list so the next foreman sees them in the suggestions.
    await db.insert(crew).values({ id: randomUUID(), name, active: true, role: "worker" });
    byKey.set(key(name), name);
    resolved.set(raw, name);
  }
  return resolved;
}

// Count this crew under this foreman so "usual crew" stays current.
export async function recordCrewUse(foreman: string, members: string[], date: string) {
  const f = clean(foreman);
  if (!f) return;
  for (const m of new Set(members.map(clean).filter(Boolean))) {
    await db.execute(sql`
      insert into foreman_crews (id, foreman, member, times, last_seen)
      values (${randomUUID()}, ${f}, ${m}, 1, ${date})
      on conflict (lower(foreman), lower(member)) do update
      set times = foreman_crews.times + 1,
          last_seen = case when excluded.last_seen > foreman_crews.last_seen then excluded.last_seen else foreman_crews.last_seen end`);
  }
}
