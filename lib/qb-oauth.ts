// Where QuickBooks sign-in happens. Intuit publishes the current addresses in its OAuth 2.0 "discovery document", so White Board
// reads them from there (and remembers them for a while) instead of trusting a copy written into the code. If Intuit's
// document can't be reached, or returns something that doesn't look right, the addresses below are used, so signing in never
// depends on the lookup working.

export type OAuthEndpoints = { authorize: string; token: string; source: "discovery" | "fallback" };

const FALLBACK = { authorize: "https://appcenter.intuit.com/connect/oauth2", token: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer" };
const DISCOVERY = {
  production: "https://developer.api.intuit.com/.well-known/openid_configuration",
  sandbox: "https://developer.api.intuit.com/.well-known/openid_sandbox_configuration",
};
const FRESH_MS = 6 * 60 * 60 * 1000; // a good lookup is reused for six hours
const RETRY_MS = 5 * 60 * 1000; // after a failed lookup, try again in five minutes

// The client secret goes to the token address, so only Intuit's own https addresses are ever accepted.
export const isIntuitUrl = (u: unknown): u is string => typeof u === "string" && /^https:\/\/([a-z0-9-]+\.)+intuit\.com\/[^\s]*$/.test(u);

let cache: { env: string; at: number; ttl: number; value: OAuthEndpoints } | null = null;

export function resetOAuthEndpointCache() {
  cache = null;
}

export async function oauthEndpoints(env: "production" | "sandbox", fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<OAuthEndpoints> {
  if (cache && cache.env === env && now - cache.at < cache.ttl) return cache.value;
  let value: OAuthEndpoints = { ...FALLBACK, source: "fallback" };
  try {
    const res = await fetchImpl(DISCOVERY[env], { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (res.ok) {
      const doc = (await res.json()) as { authorization_endpoint?: unknown; token_endpoint?: unknown };
      if (isIntuitUrl(doc.authorization_endpoint) && isIntuitUrl(doc.token_endpoint)) value = { authorize: doc.authorization_endpoint, token: doc.token_endpoint, source: "discovery" };
    }
  } catch {
    /* unreachable or not JSON: use the fallback */
  }
  cache = { env, at: now, ttl: value.source === "discovery" ? FRESH_MS : RETRY_MS, value };
  return value;
}
