import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// These are the people marked as admins in the original artifact's Team
// roster — auto-promoted to admin on their first sign-in here so the move
// to real accounts doesn't demote anyone. Everyone else starts as
// "member"; an admin promotes people from the Team page from here on
// (server-checked, not a client claim).
const FOUNDING_ADMIN_EMAILS = new Set([
  "jdale@felicianawelders.com",
  "allie@felicianawelders.com",
  "cavinp@felicianawelders.com",
  "chrisj@felicianawelders.com",
  "dpritchard@felicianawelders.com",
  "rpritchard@felicianawelders.com",
]);

type NeonAuthUser = { id: string; email: string; name?: string | null };

// Call this after confirming a session exists. Creates the profile row on
// a user's very first sign-in; leaves it untouched on later calls so an
// admin's role promotion in the Team page is never overwritten here.
export async function ensureProfile(user: NeonAuthUser) {
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(profiles)
    .values({
      id: user.id,
      email: user.email,
      name: user.name || user.email,
      role: FOUNDING_ADMIN_EMAILS.has(user.email.toLowerCase()) ? "admin" : "member",
    })
    .returning();
  return created;
}

export async function isAdmin(userId: string) {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
  });
  return profile?.role === "admin";
}
