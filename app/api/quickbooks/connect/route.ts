import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { getWorkspace } from "@/lib/auth/company";
import { authorizeUrl, qbConfig } from "@/lib/quickbooks";

const QB_STATE_COOKIE = "wb_qb_state";

// A return address must be one of our own project pages.
const safeReturn = (p: string | null) => (p && /^\/projects\/[A-Za-z0-9-]+$/.test(p) ? p : "/board");

// Admin only: sends the person to QuickBooks to allow White Board to create invoices in the company they are viewing.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = safeReturn(url.searchParams.get("returnTo"));
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") return new Response("Only admins can connect QuickBooks.", { status: 403 });
  const ws = await getWorkspace();
  if (!ws?.active) return new Response("Pick a company first.", { status: 400 });
  if (!qbConfig().configured) return NextResponse.redirect(new URL(`${returnTo}?qb=notconfigured`, req.url));

  const state = randomBytes(24).toString("hex");
  (await cookies()).set(QB_STATE_COOKIE, JSON.stringify({ state, companyId: ws.active.id, returnTo }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/quickbooks",
    maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(state));
}
