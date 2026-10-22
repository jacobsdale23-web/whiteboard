"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, hrEmployees, oqInvites } from "@/lib/db/schema";
import { canSeeHR, getSessionAndProfile } from "@/lib/auth/current-user";
import { getSiteUrl, sendMail, smtpConfigured } from "@/lib/mail";
import { inviteLink, inviteState, newInviteToken, type Invite } from "@/lib/oq-invites";

type Summary = {
  error?: string;
  created?: number;
  reused?: number;
  sent?: number;
  noEmail?: string[]; // people with no email on file: share their link another way
  failed?: { name: string; error: string }[];
};

async function requireHR() {
  const current = await getSessionAndProfile();
  return current && canSeeHR(current.profile) ? current : null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

async function emailInvite(inv: Invite, companyName: string, siteUrl: string): Promise<void> {
  if (!inv.email) throw new Error("No email address.");
  await sendMail({
    to: inv.email,
    subject: `${companyName}: your OQ practice tests`,
    text:
      `Hi ${firstName(inv.name)},\n\n` +
      `${companyName} set up OQ practice tests for you. Open this link on your phone or tablet:\n\n` +
      `${inviteLink(siteUrl, inv.token)}\n\n` +
      `There is no account or password. Save the link or bookmark it; it keeps working.\n` +
      `It's just for you, so please don't share it. If you lose it, ask HR to send it again.\n`,
  });
  await db.update(oqInvites).set({ sentAt: new Date() }).where(eq(oqInvites.id, inv.id));
}

// Several at a time so a big batch doesn't take minutes.
async function inChunks<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

// One invite per selected employee. Someone who already has a working link
// keeps it (nothing new is created, so an old email still works).
export async function createInvites(employeeIds: string[], opts: { send: boolean }): Promise<Summary> {
  const current = await requireHR();
  if (!current) return { error: "Only admins and HR can send invites." };
  if (!employeeIds.length) return { error: "Select at least one person." };
  if (opts.send && !smtpConfigured()) return { error: "Email isn't set up yet. Create the links, then copy them or use the email-app button." };

  const [people, existing, cos] = await Promise.all([
    db.select().from(hrEmployees).where(inArray(hrEmployees.id, employeeIds)),
    db.select().from(oqInvites).where(inArray(oqInvites.employeeId, employeeIds)),
    db.select().from(companies),
  ]);
  const companyName = new Map(cos.map((c) => [c.id, c.name]));
  const siteUrl = await getSiteUrl();
  const out: Summary = { created: 0, reused: 0, sent: 0, noEmail: [], failed: [] };
  const toSend: { inv: Invite; company: string }[] = [];

  for (const p of people) {
    const email = (p.personalEmail || p.email || "").trim() || null;
    let inv = existing.find((i) => i.employeeId === p.id && inviteState(i) === "active");
    if (inv) out.reused!++;
    else {
      const [created] = await db
        .insert(oqInvites)
        .values({ id: randomUUID(), token: newInviteToken(), name: p.name, email, companyId: p.companyId, employeeId: p.id, createdBy: current.profile.name })
        .returning();
      inv = created;
      out.created!++;
    }
    if (opts.send) {
      if (!inv.email && email) inv = { ...inv, email };
      if (!inv.email) out.noEmail!.push(p.name);
      else toSend.push({ inv, company: companyName.get(p.companyId) ?? "Your company" });
    }
  }

  await inChunks(toSend, 5, async ({ inv, company }) => {
    try {
      await emailInvite(inv, company, siteUrl);
      out.sent!++;
    } catch (e) {
      out.failed!.push({ name: inv.name, error: e instanceof Error ? e.message : "Couldn't send." });
    }
  });

  revalidatePath("/hr/oq-invites");
  return out;
}

// For someone who isn't on the roster (a new hire, a contractor).
export async function createManualInvite(data: { name: string; email: string; companyId: string; send: boolean }): Promise<Summary> {
  const current = await requireHR();
  if (!current) return { error: "Only admins and HR can send invites." };
  const name = data.name.trim();
  const email = data.email.trim();
  if (!name) return { error: "Name is required." };
  if (email && !looksLikeEmail(email)) return { error: "That email address doesn't look right." };
  if (!data.companyId) return { error: "Pick a company." };
  if (data.send && !email) return { error: "Enter an email address to send the link to." };
  if (data.send && !smtpConfigured()) return { error: "Email isn't set up yet. Create the link, then copy it." };

  const [inv] = await db
    .insert(oqInvites)
    .values({ id: randomUUID(), token: newInviteToken(), name, email: email || null, companyId: data.companyId, createdBy: current.profile.name })
    .returning();
  const out: Summary = { created: 1, sent: 0, failed: [] };
  if (data.send) {
    const co = await db.query.companies.findFirst({ where: eq(companies.id, data.companyId) });
    try {
      await emailInvite(inv, co?.name ?? "Your company", await getSiteUrl());
      out.sent = 1;
    } catch (e) {
      out.failed!.push({ name, error: e instanceof Error ? e.message : "Couldn't send." });
    }
  }
  revalidatePath("/hr/oq-invites");
  return out;
}

export async function resendInvite(id: string): Promise<{ error?: string }> {
  if (!(await requireHR())) return { error: "Only admins and HR can send invites." };
  if (!smtpConfigured()) return { error: "Email isn't set up yet." };
  const inv = await db.query.oqInvites.findFirst({ where: eq(oqInvites.id, id) });
  if (!inv) return { error: "Invite not found." };
  if (inviteState(inv) !== "active") return { error: "This link was revoked. Restore it first." };
  if (!inv.email) return { error: "There's no email address on this invite." };
  const co = await db.query.companies.findFirst({ where: eq(companies.id, inv.companyId) });
  try {
    await emailInvite(inv, co?.name ?? "Your company", await getSiteUrl());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't send." };
  }
  revalidatePath("/hr/oq-invites");
  return {};
}

// Stops the link working right away.
export async function revokeInvite(id: string): Promise<{ error?: string }> {
  if (!(await requireHR())) return { error: "Only admins and HR can do that." };
  await db.update(oqInvites).set({ revokedAt: new Date() }).where(eq(oqInvites.id, id));
  revalidatePath("/hr/oq-invites");
  return {};
}

// Makes a revoked link work again (same link).
export async function restoreInvite(id: string): Promise<{ error?: string }> {
  if (!(await requireHR())) return { error: "Only admins and HR can do that." };
  await db.update(oqInvites).set({ revokedAt: null }).where(eq(oqInvites.id, id));
  revalidatePath("/hr/oq-invites");
  return {};
}

export async function deleteInvite(id: string): Promise<{ error?: string }> {
  if (!(await requireHR())) return { error: "Only admins and HR can do that." };
  await db.delete(oqInvites).where(eq(oqInvites.id, id));
  revalidatePath("/hr/oq-invites");
  return {};
}
