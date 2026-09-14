"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

export async function signUpAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  const { error } = await auth.signUp.email({ name, email, password });
  if (error) {
    return { error: error.message || "Couldn't create that account." };
  }
  redirect("/board");
}
