// Pictures on a daily log. Pure, so it can be checked without a database or storage.

export type LogPhoto = { key: string; caption: string };

export const MAX_LOG_PHOTOS = 10;

// What the form sent (a JSON list of { key, caption }), kept only if every picture really belongs to this job.
export function cleanLogPhotos(raw: unknown, projectId: string): { photos: LogPhoto[] } | { error: string } {
  let list: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return { photos: [] };
    try {
      list = JSON.parse(raw);
    } catch {
      return { error: "The photos didn't come through. Please try again." };
    }
  }
  if (!Array.isArray(list)) return { photos: [] };
  const photos: LogPhoto[] = [];
  const seen = new Set<string>();
  for (const p of list.slice(0, MAX_LOG_PHOTOS)) {
    const key = String((p as { key?: unknown })?.key ?? "");
    if (!key.startsWith(`daily-logs/${projectId}/`) || key.includes("..")) return { error: "One of the photos doesn't belong to this job." };
    if (seen.has(key)) continue;
    seen.add(key);
    photos.push({ key, caption: String((p as { caption?: unknown })?.caption ?? "").trim().slice(0, 200) });
  }
  return { photos };
}
