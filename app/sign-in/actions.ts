"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function signInAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/board");

  const { error } = await auth.signIn.email({ email, password });
  if (error) {
    return { error: error.message || "Couldn't sign in with that email and password." };
  }
  redirect(next);
}
