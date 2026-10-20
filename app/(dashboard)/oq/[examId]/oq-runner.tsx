"use client";

import { useMemo, useState } from "react";

export type RunnerQuestion = {
  id: string;
  text: string;
  options: string[];
  correctIndex: number | null;
  explanation: string | null;
  keyStatus: string;
};

const letter = (i: number) => String.fromCharCode(65 + i);

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function OqRunner({ questions }: { questions: RunnerQuestion[] }) {
  const [phase, setPhase] = useState<"intro" | "running" | "done">("intro");
  const [shuffle, setShuffle] = useState(false);
  const [order, setOrder] = useState<number[]>(() => questions.map((_, i) => i));
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const current = phase === "running" ? questions[order[idx]] : null;
  const picked = current ? answers[current.id] : undefined;

  const summary = useMemo(() => {
    const scored = questions.filter((q) => q.correctIndex !== null && answers[q.id] !== undefined);
    const correct = scored.filter((q) => answers[q.id] === q.correctIndex);
    const unscored = questions.filter((q) => q.correctIndex === null).length;
    return { scored: scored.length, correct: correct.length, unscored, missed: scored.filter((q) => answers[q.id] !== q.correctIndex) };
  }, [questions, answers]);

  function start() {
    const base = questions.map((_, i) => i);
    setOrder(shuffle ? shuffled(base) : base);
    setIdx(0);
    setAnswers({});
    setPhase("running");
  }

  if (phase === "intro") {
    return (
      <div style={cardStyle}>
        <p style={{ marginBottom: 14 }}>
          {questions.length} questions. After you pick an answer you&apos;ll see right away whether it was correct, and why. Your score shows at the end.
        </p>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, fontSize: "1rem" }}>
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} style={{ width: 22, height: 22 }} />
          Shuffle the question order
        </label>
        <button onClick={start} style={bigPrimaryBtn}>
          Start Practice Test
        </button>
      </div>
    );
  }

  if (phase === "done") {
    const pct = summary.scored ? Math.round((summary.correct / summary.scored) * 100) : 0;
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>Your score</div>
        <div style={{ fontSize: "2.2rem", fontWeight: 800, margin: "4px 0" }}>
          {summary.correct} / {summary.scored} <span style={{ fontSize: "1.2rem", color: "var(--muted)" }}>({pct}%)</span>
        </div>
        {summary.unscored > 0 && (
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 12 }}>
            {summary.unscored} question{summary.unscored === 1 ? "" : "s"} on this test don&apos;t have a confirmed answer yet and weren&apos;t counted.
          </p>
        )}
        {summary.missed.length > 0 && (
          <div style={{ margin: "14px 0" }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Review what you missed</div>
            {summary.missed.map((q) => (
              <div key={q.id} style={{ borderTop: "1px solid var(--border)", padding: "12px 0" }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{q.text}</div>
                <div style={{ color: "var(--danger)", fontSize: "0.9rem" }}>
                  Your answer: {letter(answers[q.id])}. {q.options[answers[q.id]]}
                </div>
                <div style={{ color: "var(--active)", fontSize: "0.9rem", fontWeight: 600 }}>
                  Correct: {letter(q.correctIndex!)}. {q.options[q.correctIndex!]}
                </div>
                {q.explanation && <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 4 }}>{q.explanation}</div>}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={start} style={bigPrimaryBtn}>
            Try Again
          </button>
          <button onClick={() => setPhase("intro")} style={bigSecondaryBtn}>
            Back
          </button>
        </div>
      </div>
    );
  }

  const q = current!;
  const answered = picked !== undefined;
  const isLast = idx === order.length - 1;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--muted)", marginBottom: 6 }}>
        <span>
          Question {idx + 1} of {order.length}
        </span>
        <span>{summary.correct} correct so far</span>
      </div>
      <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 4, marginBottom: 16 }}>
        <div style={{ height: 6, borderRadius: 4, background: "var(--rust)", width: `${((idx + (answered ? 1 : 0)) / order.length) * 100}%` }} />
      </div>

      <div style={{ fontSize: "1.08rem", fontWeight: 600, marginBottom: 14, lineHeight: 1.4 }}>{q.text}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {q.options.map((opt, i) => {
          const isPicked = picked === i;
          const isCorrect = q.correctIndex === i;
          let border = "var(--border)";
          let bg = "var(--surface)";
          if (answered) {
            if (isCorrect) { border = "var(--active)"; bg = "var(--active-bg)"; }
            else if (isPicked && q.correctIndex !== null) { border = "var(--danger)"; bg = "var(--danger-bg)"; }
            else if (isPicked) { border = "var(--ink-soft)"; bg = "var(--surface-2)"; }
          }
          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
              style={{ textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 14px", minHeight: 54, borderRadius: 10, border: `2px solid ${border}`, background: bg, color: "var(--ink)", fontSize: "1rem", fontFamily: "inherit", cursor: answered ? "default" : "pointer" }}
            >
              <span style={{ fontWeight: 800, minWidth: 22 }}>{letter(i)}.</span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>

      {answered && (
        <div style={{ marginTop: 14 }}>
          {q.correctIndex === null ? (
            <p style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
              The correct answer for this question hasn&apos;t been confirmed yet, so it won&apos;t count toward your score. Ask your supervisor if you&apos;re unsure.
            </p>
          ) : (
            <>
              <p style={{ fontWeight: 700, color: picked === q.correctIndex ? "var(--active)" : "var(--danger)" }}>
                {picked === q.correctIndex ? "Correct!" : `Not quite. The correct answer is ${letter(q.correctIndex)}.`}
              </p>
              {q.explanation && <p style={{ color: "var(--ink-soft)", fontSize: "0.92rem", marginTop: 4 }}>{q.explanation}</p>}
              {q.keyStatus !== "verified" && (
                <p style={{ color: "var(--muted)", fontSize: "0.76rem", marginTop: 6 }}>
                  This answer was suggested by AI and hasn&apos;t been checked against the official training materials yet.
                </p>
              )}
            </>
          )}
          <button
            onClick={() => (isLast ? setPhase("done") : setIdx(idx + 1))}
            style={{ ...bigPrimaryBtn, marginTop: 14, width: "100%" }}
          >
            {isLast ? "See My Score" : "Next Question"}
          </button>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20 };
const bigPrimaryBtn: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "1px solid var(--rust)", borderRadius: 10, padding: "14px 22px", fontWeight: 700, fontSize: "1rem", cursor: "pointer", minHeight: 52 };
const bigSecondaryBtn: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 22px", fontWeight: 700, fontSize: "1rem", cursor: "pointer", minHeight: 52 };
