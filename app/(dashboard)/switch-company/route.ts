import { NextResponse } from "next/server";
import { COMPANY_COOKIE, canAccessCompany } from "@/lib/auth/company";

// Picks which company's White Board the signed-in person is looking at. The
// choice is only remembered if they are allowed into that company.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = url.searchParams.get("to") || "";
  const requested = url.searchParams.get("next") || "/board";
  // Only same-site paths; never bounce someone to another host.
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/board";

  const response = NextResponse.redirect(new URL(next, url));
  if (to && (await canAccessCompany(to))) {
    response.cookies.set(COMPANY_COOKIE, to, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}
