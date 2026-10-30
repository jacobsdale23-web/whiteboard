"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

// Neon Auth emails the person a one-time code (its shared sender, until the company mailbox exists). The answer is
// the same whether or not the address has an account, so this page can't be used to find out who does.
export async function requestPasswordResetAction(formData: FormData): Promise<{ error?: string; sent?: boolean; email?: string }> {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { error: "Enter your email address." };
  const { error } = await auth.emailOtp.requestPasswordReset({ email });
  if (error) return { error: "Couldn't send a code right now. Wait a minute and try again." };
  return { sent: true, email };
}

export async function resetPasswordAction(formData: FormData): Promise<{ error?: string; email?: string }> {
  const email = String(formData.get("email") || "").trim();
  const otp = String(formData.get("otp") || "").trim();
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (!email || !otp) return { error: "Enter the code from the email.", email };
  if (password.length < 8) return { error: "Use at least 8 characters for the new password.", email };
  if (password !== confirm) return { error: "The two passwords don't match.", email };

  const { error } = await auth.emailOtp.resetPassword({ email, otp, password });
  if (error) return { error: "That code is wrong or has expired. Request a new one and try again.", email };
  redirect("/sign-in?reset=1");
}
