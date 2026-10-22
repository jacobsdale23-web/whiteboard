import { db } from "@/lib/db";
import { profileCompanies, profiles } from "@/lib/db/schema";
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

// The people who work across all four companies. Everyone else starts with no
// company at all and waits for an admin to assign them on the Team page, so a
// new hire at one company never lands on another company's board.
const ALL_COMPANY_EMAILS = new Set([
  "jdale@felicianawelders.com",
  "allie@felicianawelders.com",
  "dpritchard@felicianawelders.com",
  "spritchard@felicianawelders.com",
]);

// Original founding admins who are not all-company start in FWI.
const DEFAULT_COMPANY = "fwi";

type NeonAuthUser = { id: string; email: string; name?: string | null };

// Call this after confirming a session exists. Creates the profile row on
// a user's very first sign-in; leaves it untouched on later calls so an
// admin's role promotion in the Team page is never overwritten here.
export async function ensureProfile(user: NeonAuthUser) {
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
  });
  if (existing) return existing;

  const email = user.email.toLowerCase();
  const isFoundingAdmin = FOUNDING_ADMIN_EMAILS.has(email);
  const [created] = await db
    .insert(profiles)
    .values({
      id: user.id,
      email: user.email,
      name: user.name || user.email,
      role: isFoundingAdmin ? "admin" : "member",
      allCompanies: ALL_COMPANY_EMAILS.has(email),
    })
    .returning();
  if (isFoundingAdmin && !created.allCompanies) {
    await db.insert(profileCompanies).values({ profileId: created.id, companyId: DEFAULT_COMPANY }).onConflictDoNothing();
  }
  return created;
}

export async function isAdmin(userId: string) {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
  });
  return profile?.role === "admin";
}
