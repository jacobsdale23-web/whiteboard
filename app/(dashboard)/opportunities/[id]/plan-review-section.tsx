"use client";

import { useState, useTransition } from "react";
import { reviewSinglePlanFile, savePlanReview, deletePlanReview } from "./plan-review-actions";

type Finding = { severity: "high" | "medium" | "low"; category: string; title: string; description: string; suggestedBidCategory: string | null };
type PlanReview = { id: string; summary: string | null; findings: Finding[] | null; createdAt: Date };
type PlanFileRef = { id: string; filename: string };

const SEVERITY_STYLE: Record<Finding["severity"], { bg: string; fg: string; icon: string }> = {
  high: { bg: "var(--danger-bg, #fdecea)", fg: "var(--danger, #c0392b)", icon: "🛑" },
  medium: { bg: "var(--upcoming-bg, #fff4e0)", fg: "var(--upcoming, #b06d00)", icon: "⚠" },
  low: { bg: "var(--surface-2)", fg: "var(--ink-soft)", icon: "•" },
};

export default function PlanReviewSection({ opportunityId, reviews, files }: { opportunityId: string; reviews: PlanReview[]; files: PlanFileRef[] }) {
  const [, startTransition] = useTransition();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const hasFiles = files.length > 0;

  async function handleRun() {
    if (!confirm("Send the uploaded plans/specs to Claude for review? This uses paid API usage (typically well under $1 per run, more for large scanned plan sets).")) return;
    setError("");
    setRunning(true);
    try {
      // One server action call per file so each file's Claude call gets its
      // own Vercel execution window instead of sharing one request's timeout.
      const outcomes = await Promise.all(files.map((f) => reviewSinglePlanFile(opportunityId, f.id)));
      const succeeded = outcomes.filter((o) => o.result);
      if (!succeeded.length) {
        setError(outcomes.map((o) => `${o.filename}: ${o.error}`).join(" | "));
        return;
      }

      const summaries = succeeded.map((o) => `${o.filename}: ${o.result!.summary}`);
      const failures = outcomes.filter((o) => o.error).map((o) => `${o.filename} could not be reviewed (${o.error}).`);
      const saved = await savePlanReview(opportunityId, {
        summary: [...summaries, ...failures].join(" "),
        findings: succeeded.flatMap((o) => o.result!.findings),
      });
      if (saved.error) setError(saved.error);
    } finally {
      setRunning(false);
    }
  }

  const sorted = reviews.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>AI Plan Review</h3>
        <button onClick={handleRun} disabled={running || !hasFiles} style={primaryBtnStyle}>
          {running ? "Reviewing…" : "Run AI Review"}
        </button>
      </div>
      <p style={{ fontSize: "0.76rem", color: "var(--muted)", marginBottom: 14 }}>
        {hasFiles ? "Flags non-standard or easily-missed items in your uploaded plans/specs." : "Upload a plan/spec PDF above to enable this."}
      </p>

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 10 }}>{error}</p>}

      {sorted.length ? (
        sorted.map((r) => <ReviewCard key={r.id} opportunityId={opportunityId} review={r} onDelete={() => startTransition(() => deletePlanReview(opportunityId, r.id))} />)
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No AI reviews run yet.</p>
      )}
    </div>
  );
}

function ReviewCard({ review, onDelete }: { opportunityId: string; review: PlanReview; onDelete: () => void }) {
  const findings = review.findings || [];
  const counts = { high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity]++;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>{new Date(review.createdAt).toLocaleString()}</div>
          {review.summary && <p style={{ fontSize: "0.87rem", marginTop: 4, maxWidth: 560 }}>{review.summary}</p>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {counts.high > 0 && <CountChip count={counts.high} style={SEVERITY_STYLE.high} />}
          {counts.medium > 0 && <CountChip count={counts.medium} style={SEVERITY_STYLE.medium} />}
          {counts.low > 0 && <CountChip count={counts.low} style={SEVERITY_STYLE.low} />}
          <button
            onClick={() => {
              if (confirm("Delete this review?")) onDelete();
            }}
            style={deleteBtnStyle}
          >
            🗑
          </button>
        </div>
      </div>

      {!!findings.length && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {findings.map((f, i) => {
            const s = SEVERITY_STYLE[f.severity];
            return (
              <div key={i} style={{ background: s.bg, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: s.fg }}>
                    {s.icon} {f.title}
                  </div>
                  <div style={{ display: "flex", gap: 5 }}>
                    <span style={tagStyle}>{f.category}</span>
                    {f.suggestedBidCategory && <span style={tagStyle}>{f.suggestedBidCategory}</span>}
                  </div>
                </div>
                <p style={{ fontSize: "0.83rem", marginTop: 4 }}>{f.description}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CountChip({ count, style }: { count: number; style: { bg: string; fg: string; icon: string } }) {
  return (
    <span style={{ background: style.bg, color: style.fg, fontSize: "0.76rem", fontWeight: 700, padding: "3px 9px", borderRadius: 20 }}>
      {style.icon} {count}
    </span>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
const tagStyle: React.CSSProperties = { background: "rgba(0,0,0,0.06)", fontSize: "0.68rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase", whiteSpace: "nowrap" };
