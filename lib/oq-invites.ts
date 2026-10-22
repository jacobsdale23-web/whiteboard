import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { oqInvites } from "@/lib/db/schema";

export type Invite = typeof oqInvites.$inferSelect;
export type InviteState = "active" | "revoked";

// 256 bits of randomness, URL-safe. The token is the only credential, and it
// never expires; HR revokes a link when someone should no longer have it.
export const newInviteToken = () => randomBytes(32).toString("base64url");

export const inviteState = (inv: Pick<Invite, "revokedAt">): InviteState => (inv.revokedAt ? "revoked" : "active");

// The invite for this token if it has not been revoked; otherwise null.
export async function findActiveInvite(token: string): Promise<Invite | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const inv = await db.query.oqInvites.findFirst({ where: eq(oqInvites.token, token) });
  return inv && inviteState(inv) === "active" ? inv : null;
}

// Count a visit. A personal link counts at most once per 10 minutes so reloads
// don't inflate it; a group link counts every open, since many people share it.
export async function recordInviteVisit(inv: Invite): Promise<void> {
  const now = new Date();
  if (!inv.isGroup && inv.lastUsedAt && now.getTime() - inv.lastUsedAt.getTime() < 10 * 60 * 1000) return;
  await db.update(oqInvites).set({ lastUsedAt: now, useCount: inv.useCount + 1 }).where(eq(oqInvites.id, inv.id));
}

export const inviteLink = (siteUrl: string, token: string) => `${siteUrl}/oq-practice/${token}`;
