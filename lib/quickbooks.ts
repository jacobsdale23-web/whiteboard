import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { qbConnections } from "@/lib/db/schema";

// Direct connection to QuickBooks Online, so an approved White Board invoice can be created there with one click.
// Needs an Intuit developer app (free) whose keys are set as QB_CLIENT_ID and QB_CLIENT_SECRET; QB_ENV is "production"
// (the default) or "sandbox"; QB_REDIRECT_URI must match the app's redirect URI exactly.

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const MINOR_VERSION = "75";

export const DEFAULT_REDIRECT_URI = "https://www.whiteboard.cloud/api/quickbooks/callback";

export function qbConfig() {
  const clientId = process.env.QB_CLIENT_ID || "";
  const clientSecret = process.env.QB_CLIENT_SECRET || "";
  return {
    configured: !!clientId && !!clientSecret,
    clientId,
    clientSecret,
    redirectUri: process.env.QB_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    apiBase: process.env.QB_ENV === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com",
  };
}

// ---- token encryption (AES-256-GCM, key derived from the client secret, so no extra setting is needed) ----

function key(): Buffer {
  return createHash("sha256").update(`white-board-quickbooks-tokens:${qbConfig().clientSecret}`).digest();
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptToken(stored: string): string {
  const [iv, tag, enc] = stored.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ---- OAuth ----

export function authorizeUrl(state: string): string {
  const c = qbConfig();
  const q = new URLSearchParams({ client_id: c.clientId, scope: "com.intuit.quickbooks.accounting", redirect_uri: c.redirectUri, response_type: "code", state });
  return `${AUTHORIZE_URL}?${q}`;
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const c = qbConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.clientId}:${c.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`QuickBooks sign-in failed (${res.status}).`);
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: qbConfig().redirectUri });
}

export async function saveConnection(companyId: string, realmId: string, t: TokenResponse, connectedBy: string, companyName: string | null) {
  const now = Date.now();
  const values = {
    companyId,
    realmId,
    companyName,
    accessToken: encryptToken(t.access_token),
    refreshToken: encryptToken(t.refresh_token),
    accessExpiresAt: new Date(now + t.expires_in * 1000),
    refreshExpiresAt: new Date(now + t.x_refresh_token_expires_in * 1000),
    connectedBy,
    connectedAt: new Date(),
  };
  await db.insert(qbConnections).values(values).onConflictDoUpdate({ target: qbConnections.companyId, set: values });
}

export async function getConnection(companyId: string) {
  const [row] = await db.select().from(qbConnections).where(eq(qbConnections.companyId, companyId));
  return row || null;
}

export async function disconnect(companyId: string) {
  await db.delete(qbConnections).where(eq(qbConnections.companyId, companyId));
}

// A usable access token for the company, refreshed (and the new refresh token saved) when it is about to expire.
async function accessToken(companyId: string): Promise<{ token: string; realmId: string }> {
  const conn = await getConnection(companyId);
  if (!conn) throw new QbError("QuickBooks isn't connected for this company yet.");
  if (conn.refreshExpiresAt.getTime() < Date.now()) throw new QbError("The QuickBooks connection has expired. Connect QuickBooks again.");
  if (conn.accessExpiresAt.getTime() - Date.now() > 120_000) return { token: decryptToken(conn.accessToken), realmId: conn.realmId };

  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decryptToken(conn.refreshToken) }).catch(() => {
    throw new QbError("QuickBooks turned down the saved connection. Connect QuickBooks again.");
  });
  const now = Date.now();
  await db
    .update(qbConnections)
    .set({
      accessToken: encryptToken(t.access_token),
      refreshToken: encryptToken(t.refresh_token),
      accessExpiresAt: new Date(now + t.expires_in * 1000),
      refreshExpiresAt: new Date(now + t.x_refresh_token_expires_in * 1000),
    })
    .where(eq(qbConnections.companyId, companyId));
  return { token: t.access_token, realmId: conn.realmId };
}

// ---- API ----

// Errors whose message is safe and useful to show to the person billing.
export class QbError extends Error {}

type QbFault = { Fault?: { Error?: { Message?: string; Detail?: string }[] } };

export async function qbApi<T = Record<string, unknown>>(companyId: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  // White Board creates invoices in QuickBooks but never sends or emails anything from there: invoices are downloaded
  // as PDFs and sent by hand. This stops any QuickBooks "send" or "email" call, whoever writes the code later.
  if (/\/send(\b|\?|$)|sendTo=|\/email/i.test(path) || /"(BillEmail|EmailStatus|DeliveryInfo)"/.test(body ? JSON.stringify(body) : "")) {
    throw new QbError("White Board never emails invoices from QuickBooks.");
  }
  const { token, realmId } = await accessToken(companyId);
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${qbConfig().apiBase}/v3/company/${realmId}${path}${sep}minorversion=${MINOR_VERSION}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const f = (await res.json()) as QbFault;
      detail = (f.Fault?.Error || []).map((e) => [e.Message, e.Detail].filter(Boolean).join(": ")).join("; ");
    } catch {
      /* not JSON */
    }
    if (res.status === 401) throw new QbError("QuickBooks turned down the connection. Connect QuickBooks again.");
    throw new QbError(`QuickBooks said no${detail ? `: ${detail}` : ` (${res.status})`}.`);
  }
  return (await res.json()) as T;
}

// QuickBooks query language; single quotes in values are escaped with a backslash.
export const qbQuote = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export async function qbQuery<T>(companyId: string, sql: string, entity: string): Promise<T[]> {
  const res = await qbApi<{ QueryResponse?: Record<string, T[]> }>(companyId, "GET", `/query?query=${encodeURIComponent(sql)}`);
  return res.QueryResponse?.[entity] || [];
}

type QbCustomer = { Id: string; DisplayName: string };

// The QuickBooks customer (job) an invoice is billed to: the job named with the project number ("26100 - Luling 8"
// Ph 1"), or else the fallback customer name. Never guessed and never created; a string result is the reason it failed.
export async function findJobCustomer(companyId: string, projectNumber: string | null, fallbackName: string | null): Promise<QbCustomer | string> {
  if (projectNumber) {
    const found = await qbQuery<QbCustomer>(companyId, `select Id, DisplayName from Customer where DisplayName like '${qbQuote(projectNumber)}%'`, "Customer");
    const exact = found.filter((c) => c.DisplayName.startsWith(`${projectNumber} -`) || c.DisplayName === projectNumber);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return `QuickBooks has more than one job starting ${projectNumber} (${exact.map((c) => c.DisplayName).join("; ")}). Create this invoice by hand, or tell Jacob.`;
  }
  if (fallbackName) {
    const found = await qbQuery<QbCustomer>(companyId, `select Id, DisplayName from Customer where DisplayName = '${qbQuote(fallbackName)}'`, "Customer");
    if (found.length === 1) return found[0];
  }
  return `QuickBooks has no job ${projectNumber ? `named ${projectNumber} - ...` : "for this project"} yet${fallbackName ? ` and no customer named "${fallbackName}"` : ""}. Create the job in QuickBooks first, then try again.`;
}

export async function qbCompanyName(companyId: string): Promise<string | null> {
  const { realmId } = await accessToken(companyId);
  const res = await qbApi<{ CompanyInfo?: { CompanyName?: string } }>(companyId, "GET", `/companyinfo/${realmId}`);
  return res.CompanyInfo?.CompanyName || null;
}

// Attach a file to a transaction (best effort: the caller decides what a failure means).
export async function qbAttach(companyId: string, entity: "Invoice", entityId: string, filename: string, contentType: string, data: Buffer) {
  const { token, realmId } = await accessToken(companyId);
  const form = new FormData();
  form.append(
    "file_metadata_01",
    new Blob([JSON.stringify({ AttachableRef: [{ EntityRef: { type: entity, value: entityId } }], FileName: filename, ContentType: contentType })], { type: "application/json" }),
    "attachment.json"
  );
  form.append("file_content_01", new Blob([new Uint8Array(data)], { type: contentType }), filename);
  const res = await fetch(`${qbConfig().apiBase}/v3/company/${realmId}/upload?minorversion=${MINOR_VERSION}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    body: form,
  });
  if (!res.ok) throw new QbError(`QuickBooks wouldn't take the attachment (${res.status}).`);
}
