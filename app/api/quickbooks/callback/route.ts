import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { canAccessCompany } from "@/lib/auth/company";
import { exchangeCode, qbCompanyName, saveConnection } from "@/lib/quickbooks";
import { db } from "@/lib/db";
import { qbConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const STATE_COOKIE = "wb_qb_state";

// QuickBooks sends the person back here after they allow (or refuse) the connection.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  let saved: { state: string; companyId: string; returnTo: string } | null = null;
  try {
    saved = JSON.parse(jar.get(STATE_COOKIE)?.value || "null");
  } catch {
    saved = null;
  }
  jar.delete({ name: STATE_COOKIE, path: "/api/quickbooks" });
  const back = (flag: string) => NextResponse.redirect(new URL(`${saved?.returnTo || "/board"}?qb=${flag}`, req.url));

  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") return new Response("Only admins can connect QuickBooks.", { status: 403 });
  // The state must be the one this browser started with, so a link someone else made can't connect their QuickBooks.
  if (!saved || !url.searchParams.get("state") || url.searchParams.get("state") !== saved.state) return back("failed");
  if (!(await canAccessCompany(saved.companyId))) return back("failed");

  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  if (url.searchParams.get("error") || !code || !realmId) return back("declined");

  try {
    const tokens = await exchangeCode(code);
    await saveConnection(saved.companyId, realmId, tokens, current.profile.name, null);
    const name = await qbCompanyName(saved.companyId).catch(() => null);
    if (name) await db.update(qbConnections).set({ companyName: name }).where(eq(qbConnections.companyId, saved.companyId));
    return back("connected");
  } catch {
    return back("failed");
  }
}
