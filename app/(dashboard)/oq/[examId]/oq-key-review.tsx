"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOqAnswer, verifyExamKey } from "../actions";

type ReviewQuestion = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number | null;
  aiGuessIndex: number | null;
  keyStatus: string;
};

const letter = (i: number) => String.fromCharCode(65 + i);

const STATUS_LABEL: Record<string, string> = { verified: "Verified", ai: "AI-suggested", unconfirmed: "Unconfirmed" };

export default function OqKeyReview({
  examId,
  questions,
  unconfirmed,
  unverified,
}: {
  examId: string;
  questions: ReviewQuestion[];
  unconfirmed: number;
  unverified: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  function save(questionId: string, index: number | null) {
    setError("");
    setMsg("");
    startTransition(async () => {
      const res = await setOqAnswer(questionId, index);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function verifyAll() {
    setError("");
    setMsg("");
    startTransition(async () => {
      const res = await verifyExamKey(examId);
      if (res.error) setError(res.error);
      else {
        setMsg(`Marked ${res.count} answers as verified.`);
        router.refresh();
      }
    });
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Answer key (admin)</h3>
          <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 2 }}>
            {unverified} AI-suggested · {unconfirmed} unconfirmed. The original quizzes didn&apos;t include their answer keys, so please check them against your OQ materials.
          </p>
        </div>
        <button onClick={() => setOpen((o) => !o)} style={btnStyle}>
          {open ? "Hide" : "Review answer key"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={verifyAll} disabled={pending || unverified === 0} style={btnStyle}>
              Mark all AI-suggested answers on this test as verified
            </button>
            {msg && <span style={{ color: "var(--active)", fontSize: "0.82rem", fontWeight: 600 }}>{msg}</span>}
            {error && <span style={{ color: "var(--danger)", fontSize: "0.82rem" }}>{error}</span>}
          </div>

          {questions.map((q, n) => (
            <div key={q.id} style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                  {n + 1}. {q.text}
                </div>
                <span style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: q.keyStatus === "verified" ? "var(--active)" : q.keyStatus === "ai" ? "var(--upcoming)" : "var(--danger)", whiteSpace: "nowrap" }}>
                  {STATUS_LABEL[q.keyStatus] || q.keyStatus}
                </span>
              </div>
              {q.options.map((opt, i) => (
                <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", fontSize: "0.88rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name={`key-${q.id}`}
                    checked={q.correctIndex === i}
                    disabled={pending}
                    onChange={() => save(q.id, i)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>{letter(i)}.</strong> {opt}
                    {q.correctIndex === null && q.aiGuessIndex === i && <em style={{ color: "var(--muted)" }}> (AI leaned this way, but its two passes disagreed)</em>}
                  </span>
                </label>
              ))}
              {q.correctIndex !== null && (
                <button onClick={() => save(q.id, null)} disabled={pending} style={{ ...btnStyle, marginTop: 4 }}>
                  Clear answer (don&apos;t score this question)
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "8px 14px", borderRadius: 6, fontSize: "0.82rem", fontWeight: 600, cursor: "pointer" };
