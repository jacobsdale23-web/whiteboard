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
