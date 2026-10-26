// This is a company-only app — sign-up is restricted to company email
// addresses. Enforced at every account-creation entry point, not just the
// sign-up form, since Neon Auth's API route can also be hit directly.
//
// Each sibling company has its own email domain. A person who signs up with one
// of those domains is placed in that company only (see ensureProfile); the
// Feliciana domain has no company of its own here because FWI staff are
// assigned by an admin.
const COMPANY_EMAIL_DOMAINS: Record<string, string | null> = {
  "felicianawelders.com": null,
  "oandm.net": "om",
  "p-group.org": "pgroup",
  "pipeline-integrity.com": "pip",
};

function domainOf(email: string): string {
  return email.trim().toLowerCase().split("@").pop() ?? "";
}

export function isAllowedSignupEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  return trimmed.includes("@") && domainOf(trimmed) in COMPANY_EMAIL_DOMAINS;
}

// The company a sign-up domain belongs to, or null when an admin assigns it.
export function companyForEmail(email: string): string | null {
  return COMPANY_EMAIL_DOMAINS[domainOf(email)] ?? null;
}

export const SIGNUP_RESTRICTION_MESSAGE =
  "Sign-up is restricted to Feliciana Welders, O&M Management, P-Group and PIP Services company email addresses. Ask an admin if you need access.";
