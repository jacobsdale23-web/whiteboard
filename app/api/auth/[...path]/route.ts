import { auth } from "@/lib/auth/server";
import { isAllowedSignupEmail, SIGNUP_RESTRICTION_MESSAGE } from "@/lib/auth/allowed-signup";

const { GET, POST: authPost } = auth.handler();

export { GET };

// This is the real enforcement point — someone can call this route directly
// with the same payload our sign-up form sends, bypassing app/sign-up
// entirely. Block it here too so the restriction can't be worked around.
export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.join("/") === "sign-up/email") {
    const body = await request
      .clone()
      .json()
      .catch(() => null);
    const email = typeof body?.email === "string" ? body.email : "";
    if (!isAllowedSignupEmail(email)) {
      return Response.json({ message: SIGNUP_RESTRICTION_MESSAGE }, { status: 403 });
    }
  }
  return authPost(request, context);
}
