"use client";

import { useState, useTransition } from "react";
import { OM_HEADER_FIELDS, OM_NARRATIVE, formatOmDate, formatOmValue, fieldVisible, omJobType, sectionsFor, type OmField } from "@/lib/om-report";
import OmReportForm, { type OmReportRow } from "./om-report-form";
import { deleteOmReport, getOmPhotoUrls } from "./om-report-actions";

type Photo = { url: string; caption: string; key: string };

export default function OmReportSection({
  projectId,
  reports,
  isAdmin,
  readOnly,
  people,
  defaultAddress,
}: {
  projectId: string;
  reports: OmReportRow[];
  isAdmin: boolean;
  readOnly: boolean;
  people: string[];
  defaultAddress: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, Photo[]>>({});
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();
  const sorted = reports.slice().sort((a, b) => b.date.localeCompare(a.date));
  const formProps = { projectId, isAdmin, people, defaultAddress };

  async function toggle(r: OmReportRow) {
    if (openId === r.id) return setOpenId(null);
    setOpenId(r.id);
    if (r.photos.length && !photos[r.id]) {
      const res = await getOmPhotoUrls(projectId, r.id);
      if (res.photos) setPhotos((p) => ({ ...p, [r.id]: res.photos! }));
    }
  }

  return (
    <div style={cardStyle}>
      <div style={headStyle}>
        <div>
          <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>O&amp;M Field Reports</h3>
          <p style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>Pick the kind of job and fill in only what applies to it.</p>
        </div>
        {!readOnly && (
          <button onClick={() => setShowForm((s) => !s)} style={addBtnStyle}>
            + New Report
          </button>
        )}
      </div>

      {showForm && !readOnly && <OmReportForm {...formProps} onDone={() => setShowForm(false)} />}
      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 10 }}>{error}</p>}

      {sorted.length ? (
        sorted.map((r) => {
          if (editingId === r.id && !readOnly) return <OmReportForm key={r.id} {...formProps} initial={r} onDone={() => setEditingId(null)} />;
          const jt = omJobType(r.jobType);
          const open = openId === r.id;
          return (
            <div key={r.id} style={rowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--muted)" }}>{r.date}</div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  <span style={chipStyle}>{jt?.label || r.jobType}</span>
                  {r.data.address ? String(r.data.address) : "No address"}
                </div>
                <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 2 }}>
                  {[r.technician ? `Tech: ${r.technician}` : "", r.data.area ? `Area: ${r.data.area}` : "", r.photos.length ? `${r.photos.length} photo${r.photos.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}
                </div>
                {open && <Detail report={r} photos={photos[r.id]} isAdmin={isAdmin} />}
                {r.editedAt && (
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 4 }}>
                    Edited{r.editedBy ? ` by ${r.editedBy}` : ""} on {new Date(r.editedAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button onClick={() => void toggle(r)} style={{ ...smallBtnStyle }}>
                  {open ? "Hide" : "View"}
                </button>
                <button onClick={() => window.open(`/projects/${projectId}/om-report-pdf?id=${r.id}`, "_blank")} style={smallBtnStyle} title="Open as a PDF">
                  PDF
                </button>
                {!readOnly && (
                  <>
                    <button onClick={() => setEditingId(r.id)} style={iconBtnStyle} title="Edit this report">
                      ✎
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm("Delete this report and its photos?")) return;
                        startTransition(async () => {
                          const res = await deleteOmReport(projectId, r.id);
                          setError(res.error || "");
                        });
                      }}
                      style={iconBtnStyle}
                      title="Delete"
                    >
                      🗑
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No field reports yet.</p>
      )}
    </div>
  );
}

// The answers that were filled in, grouped by section; blank fields are left out.
function Detail({ report, photos, isAdmin }: { report: OmReportRow; photos?: Photo[]; isAdmin: boolean }) {
  const groups: { title: string; fields: OmField[] }[] = [
    { title: "Job", fields: OM_HEADER_FIELDS.filter((f) => !f.officeOnly || isAdmin) },
    ...sectionsFor(report.jobType, report.extras, report.data).map((s) => ({ title: s.title, fields: s.fields.filter((f) => fieldVisible(f, report.data)) })),
    { title: "What was done", fields: [OM_NARRATIVE] },
  ];
  return (
    <div style={{ marginTop: 10 }}>
      {groups.map((g) => {
        const filled = g.fields.filter((f) => formatOmValue(f, report.data[f.key]));
        if (!filled.length) return null;
        return (
          <div key={g.title} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", marginBottom: 3 }}>{g.title}</div>
            {filled.map((f) => (
              <div key={f.key} style={{ fontSize: "0.83rem", marginBottom: 2, display: "flex", gap: 8 }}>
                <span style={{ color: "var(--ink-soft)", minWidth: 150, flexShrink: 0 }}>{f.label}</span>
                <span style={{ whiteSpace: "pre-wrap" }}>{formatOmValue(f, report.data[f.key])}</span>
              </div>
            ))}
          </div>
        );
      })}
      {report.date && <div style={{ fontSize: "0.76rem", color: "var(--muted)" }}>Date performed: {formatOmDate(report.date)}</div>}
      {!!report.photos.length && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8, marginTop: 10 }}>
          {(photos || report.photos.map((p) => ({ ...p, url: "" }))).map((p, i) => (
            <figure key={p.key} style={{ margin: 0 }}>
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt={p.caption || `Photo ${i + 1}`} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 6, cursor: "zoom-in" }} onClick={() => window.open(p.url, "_blank")} />
              ) : (
                <div style={{ height: 110, display: "grid", placeItems: "center", color: "var(--muted)", fontSize: "0.76rem", background: "var(--surface-2)", borderRadius: 6 }}>Loading…</div>
              )}
              <figcaption style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: 2 }}>{p.caption || `Pic ${i + 1}`}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {report.signature && (
        <div style={{ marginTop: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={report.signature} alt="Signature" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 6, height: 60 }} />
          <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Signed: {report.technician}</div>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 };
const headStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 10 };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "12px 0", borderBottom: "1px solid var(--border)" };
const smallBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, height: 26, padding: "0 8px", cursor: "pointer", color: "var(--ink-soft)", fontSize: "0.72rem", fontWeight: 600 };
const iconBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 26, height: 26, cursor: "pointer", color: "var(--muted)", flexShrink: 0 };
const chipStyle: React.CSSProperties = { marginRight: 8, background: "var(--surface-2)", color: "var(--ink-soft)", fontSize: "0.66rem", fontWeight: 700, padding: "2px 7px", borderRadius: 20, textTransform: "uppercase" };
