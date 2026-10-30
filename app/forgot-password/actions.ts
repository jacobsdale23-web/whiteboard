"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

// Neon Auth emails the person a one-time code (its shared sender, until the company mailbox exists). These call
// its email-OTP endpoints directly with the page's own origin, which Neon Auth checks against its trusted origins.
async function neonAuthPost(path: string, body: Record<string, string>): Promise<{ ok: boolean; status: number }> {
  const base = (process.env.NEON_AUTH_BASE_URL || "").replace(/\/$/, "");
  if (!base) return { ok: false, status: 0 };
  const h = await headers();
  const origin = h.get("origin") || `https://${h.get("host")}`;
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return { ok: res.ok, status: res.status };
}

// The answer is the same whether or not the address has an account, so this page can't be used to find out
// who does.
export async function requestPasswordResetAction(formData: FormData): Promise<{ error?: string; sent?: boolean; email?: string }> {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { error: "Enter your email address." };
  try {
    const res = await neonAuthPost("/email-otp/request-password-reset", { email });
    if (!res.ok) return { error: "Couldn't send a code right now. Wait a minute and try again." };
    return { sent: true, email };
  } catch {
    return { error: "Couldn't send a code right now. Wait a minute and try again." };
  }
}

export async function resetPasswordAction(formData: FormData): Promise<{ error?: string; email?: string }> {
  const email = String(formData.get("email") || "").trim();
  const otp = String(formData.get("otp") || "").trim();
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (!email || !otp) return { error: "Enter the code from the email.", email };
  if (password.length < 8) return { error: "Use at least 8 characters for the new password.", email };
  if (password !== confirm) return { error: "The two passwords don't match.", email };

  let ok = false;
  try {
    ok = (await neonAuthPost("/email-otp/reset-password", { email, otp, password })).ok;
  } catch {
    ok = false;
  }
  if (!ok) return { error: "That code is wrong or has expired. Request a new one and try again.", email };
  redirect("/sign-in?reset=1");
}
