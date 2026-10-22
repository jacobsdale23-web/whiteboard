import nodemailer from "nodemailer";
import { headers } from "next/headers";

// Outgoing mail uses the same SMTP settings as the weekly JSA report
// (SMTP_USER / SMTP_PASSWORD, defaults to Microsoft 365 / Outlook).
export const smtpConfigured = () => !!process.env.SMTP_USER && !!process.env.SMTP_PASSWORD;

export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!user || !pass) throw new Error("Email isn't set up yet (SMTP_USER and SMTP_PASSWORD).");
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
  });
  await transport.sendMail({ from: `White Board <${user}>`, to: opts.to, subject: opts.subject, text: opts.text });
}

// The address people use to reach the app, for links in emails.
export async function getSiteUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  if (!host) return "https://www.whiteboard.cloud";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
