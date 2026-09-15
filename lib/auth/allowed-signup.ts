// This is a company-only app — sign-up is restricted to company email
// addresses. Enforced at every account-creation entry point, not just the
// sign-up form, since Neon Auth's API route can also be hit directly.
const ALLOWED_SIGNUP_DOMAIN = "felicianawelders.com";

export function isAllowedSignupEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${ALLOWED_SIGNUP_DOMAIN}`);
}

export const SIGNUP_RESTRICTION_MESSAGE =
  "Sign-up is restricted to Feliciana Welders company email addresses. Ask an admin if you need access.";
