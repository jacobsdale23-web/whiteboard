"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { signInAction } from "./actions";

type ActionState = { error?: string } | null;

async function submit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await signInAction(formData);
  return result ?? null;
}

function SignInForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/board";
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submit, null);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input type="hidden" name="next" value={next} />
      <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.85rem" }}>
        Email
        <input type="email" name="email" required style={inputStyle} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.85rem" }}>
        Password
        <input type="password" name="password" required style={inputStyle} />
      </label>
      {state?.error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{state.error}</p>}
      <button type="submit" disabled={pending} style={buttonStyle}>
        {pending ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}

export default function SignInPage() {
  return (
    <main style={{ maxWidth: 380, margin: "10vh auto", padding: 24 }}>
      <h1 style={{ fontSize: "1.6rem", textTransform: "uppercase", marginBottom: 4 }}>White Board</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>Sign in to continue.</p>
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
      <p style={{ marginTop: 18, fontSize: "0.85rem", color: "var(--muted)" }}>
        No account yet? <a href="/sign-up" style={{ textDecoration: "underline" }}>Create one</a>
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
