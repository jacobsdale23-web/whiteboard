import { cache } from "react";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/auth/profile";

// cache() dedupes this within a single request, so the layout and the
// page it wraps both calling this only hit the database/auth once.
export const getSessionAndProfile = cache(async () => {
  const { data: session } = await auth.getSession();
  if (!session?.user) return null;
  const profile = await ensureProfile(session.user);
  return { user: session.user, profile };
});

// Who may read equipment tickets. Always re-check this on the server.
export function canSeeEquipment(profile: { role: string; isMechanic: boolean; isSafety: boolean }): boolean {
  return profile.role === "admin" || (profile.isMechanic && !profile.isSafety);
}

// Who may open the HR module (candidates, employees, drug & alcohol testing,
// OQ qualifications): admins and people marked HR on the Team page. A
// view-only safety account never gets it. Always re-check this on the server.
export function canSeeHR(profile: { role: string; isHR: boolean; isSafety: boolean }): boolean {
  return profile.role === "admin" || (profile.isHR && !profile.isSafety);
}

// A safety coordinator account is view-only: it sees projects, the calendar,
// daily logs, JSAs and OQ practice tests, and nothing else. Admins are never
// restricted, even if the flag is somehow set on them.
export function isSafetyViewer(profile: { role: string; isSafety: boolean }): boolean {
  return profile.role !== "admin" && profile.isSafety;
}

// Guard for server actions that change data: a safety coordinator account
// must not be able to trigger them, regardless of what the UI shows.
export async function assertNotSafety(): Promise<void> {
  const current = await getSessionAndProfile();
  if (current && isSafetyViewer(current.profile)) {
    throw new Error("This account is view-only.");
  }
}
