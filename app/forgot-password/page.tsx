"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, resetPasswordAction } from "./actions";

type RequestState = { error?: string; sent?: boolean; email?: string } | null;
type ResetState = { error?: string; email?: string } | null;

async function requestSubmit(_prev: RequestState, formData: FormData): Promise<RequestState> {
  return (await requestPasswordResetAction(formData)) ?? null;
}
async function resetSubmit(_prev: ResetState, formData: FormData): Promise<ResetState> {
  return (await resetPasswordAction(formData)) ?? null;
}

export default function ForgotPasswordPage() {
  const [requested, requestAction, requesting] = useActionState<RequestState, FormData>(requestSubmit, null);
  const [reset, resetAction, resetting] = useActionState<ResetState, FormData>(resetSubmit, null);
  const email = requested?.email || "";

  return (
    <main style={{ maxWidth: 380, margin: "10vh auto", padding: 24 }}>
      <h1 style={{ fontSize: "1.6rem", textTransform: "uppercase", marginBottom: 4 }}>White Board</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>{requested?.sent ? "Check your email for a code." : "Reset your password."}</p>

      {!requested?.sent ? (
        <form action={requestAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.85rem" }}>
            Your work email
            <input type="email" name="email" required autoComplete="email" style={inputStyle} />
          </label>
          {requested?.error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{requested.error}</p>}
          <button type="submit" disabled={requesting} style={buttonStyle}>
            {requesting ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form action={resetAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>
            If {email} has an account, a 6-digit code is on its way. It can take a minute, and may land in spam.
          </p>
          <input type="hidden" name="email" value={email} />
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.85rem" }}>
            Code from the email
            <input type="text" name="otp" required inputMode="numeric" autoComplete="one-time-code" style={inputStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.85rem" }}>
            New password
            <input type="password" name="password" required minLength={8} autoComplete="new-password" style={inputStyle} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.85rem" }}>
            Type it again
            <input type="password" name="confirm" required minLength={8} autoComplete="new-password" style={inputStyle} />
          </label>
          {reset?.error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{reset.error}</p>}
          <button type="submit" disabled={resetting} style={buttonStyle}>
            {resetting ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}

      <p style={{ marginTop: 18, fontSize: "0.85rem", color: "var(--muted)" }}>
        <a href="/sign-in" style={{ textDecoration: "underline" }}>Back to sign in</a>
      </p>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "9px 10px",
  fontSize: "0.92rem",
  color: "var(--ink)",
  fontFamily: "inherit",
};

const buttonStyle: React.CSSProperties = {
  background: "var(--rust)",
  color: "var(--rust-ink)",
  border: "none",
  borderRadius: 6,
  padding: "10px 16px",
  fontWeight: 600,
  cursor: "pointer",
};
