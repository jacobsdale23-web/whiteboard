"use client";

import { useActionState } from "react";
import { signUpAction } from "./actions";

type ActionState = { error?: string } | null;

async function submit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await signUpAction(formData);
  return result ?? null;
}

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submit, null);

  return (
    <main style={{ maxWidth: 380, margin: "10vh auto", padding: 24 }}>
      <h1 style={{ fontSize: "1.6rem", textTransform: "uppercase", marginBottom: 4 }}>White Board</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>Create your account.</p>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.85rem" }}>
          Name
          <input type="text" name="name" required style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.85rem" }}>
          Email
          <input type="email" name="email" required style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: "0.85rem" }}>
          Password
          <input type="password" name="password" required minLength={8} style={inputStyle} />
        </label>
        {state?.error && <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{state.error}</p>}
        <button type="submit" disabled={pending} style={buttonStyle}>
          {pending ? "Creating account…" : "Create Account"}
        </button>
      </form>
      <p style={{ marginTop: 18, fontSize: "0.85rem", color: "var(--muted)" }}>
        Already have an account? <a href="/sign-in" style={{ textDecoration: "underline" }}>Sign in</a>
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
