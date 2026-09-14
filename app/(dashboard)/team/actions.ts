"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";

// Real, server-enforced admin check — this is what actually protects role
// changes and Budget data, regardless of what any client-side UI shows.
async function requireAdmin() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") {
    throw new Error("Only admins can manage team roles.");
  }
  return current;
}

export async function setRole(userId: string, role: "admin" | "member") {
  const current = await requireAdmin();
  if (current.profile.id === userId && role !== "admin") {
    throw new Error("You can't remove your own admin access — have another admin do it.");
  }
  await db.update(profiles).set({ role }).where(eq(profiles.id, userId));
  revalidatePath("/team");
}
