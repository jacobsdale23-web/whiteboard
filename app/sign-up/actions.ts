"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { isAllowedSignupEmail, SIGNUP_RESTRICTION_MESSAGE } from "@/lib/auth/allowed-signup";

export async function signUpAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!isAllowedSignupEmail(email)) {
    return { error: SIGNUP_RESTRICTION_MESSAGE };
  }

  const { error } = await auth.signUp.email({ name, email, password });
  if (error) {
    return { error: error.message || "Couldn't create that account." };
  }
  redirect("/board");
}
