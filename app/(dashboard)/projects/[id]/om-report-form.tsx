"use client";

import { useEffect, useId, useRef, useState } from "react";
import { shrinkPhoto } from "@/lib/shrink-photo";
import {
  MAX_OM_PHOTOS,
  OM_HEADER_FIELDS,
  OM_JOB_TYPES,
  OM_NARRATIVE,
  OM_SECTIONS,
  addableSections,
  fieldVisible,
  omJobType,
  sectionsFor,
  type OmData,
  type OmField,
  type OmValue,
} from "@/lib/om-report";
import { discardOmPhoto, getOmPhotoUrls, requestOmPhotoUpload, saveOmReport } from "./om-report-actions";

export type OmReportRow = {
  id: string;
  date: string;
  jobType: string;
  extras: string[];
  data: OmData;
  photos: { key: string; caption: string }[];
  technician: string | null;
  signature: string | null;
  submittedBy: string | null;
  editedAt: string | null;
  editedBy: string | null;
};

type PhotoDraft = { key: string; caption: string; previewUrl?: string; isNew?: boolean };

const today = () => new Date().toISOString().slice(0, 10);

export default function OmReportForm({
  projectId,
  initial,
  isAdmin,
  people,
  defaultAddress,
  onDone,
}: {
  projectId: string;
  initial?: OmReportRow;
  isAdmin: boolean;
  people: string[];
  defaultAddress: string;
  onDone: () => void;
}) {
  const editing = !!initial;
  const listId = useId();
  const [jobType, setJobType] = useState(initial?.jobType || "");
  const [extras, setExtras] = useState<string[]>(initial?.extras || []);
  const [date, setDate] = useState(initial?.date || today());
  const [data, setData] = useState<OmData>(initial?.data || (defaultAddress ? { address: defaultAddress } : {}));
  const [technician, setTechnician] = useState(initial?.technician || "");
  const [photos, setPhotos] = useState<PhotoDraft[]>(initial?.photos || []);
  const [signature, setSignature] = useState<string | null>(initial?.signature || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  // Saved photos come back as links so they can be seen (and removed) while editing.
  const initialId = initial?.id;
  const hadPhotos = !!initial?.photos.length;
  useEffect(() => {
    if (!initialId || !hadPhotos) return;
    let alive = true;
    getOmPhotoUrls(projectId, initialId).then((res) => {
      if (!alive || !res.photos) return;
      const urls = new Map(res.photos.map((p) => [p.key, p.url]));
      setPhotos((cur) => cur.map((p) => ({ ...p, previewUrl: p.previewUrl || urls.get(p.key) })));
    });
    return () => {
      alive = false;
    };
  }, [initialId, hadPhotos, projectId]);

  const jt = omJobType(jobType);
  const sections = jt ? sectionsFor(jobType, extras, data) : [];
  const addable = jt ? addableSections(jobType, extras) : [];

  const setValue = (key: string, value: OmValue | undefined) =>
    setData((d) => {
      const next = { ...d };
      if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) delete next[key];
      else next[key] = value;
      return next;
    });

  function pickJobType(id: string) {
    const picked = omJobType(id)!;
    setJobType(id);
    setExtras([]);
    // A new service is always a service pipe; fill it in unless they already chose something.
    setData((d) => ({ ...(picked.preset || {}), ...d }));
  }

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    setError("");
    if (photos.length >= MAX_OM_PHOTOS) return setError(`You can add up to ${MAX_OM_PHOTOS} photos.`);
    setBusy("Uploading photo…");
    try {
      const blob = await shrinkPhoto(file);
      const req = await requestOmPhotoUpload(projectId, blob.type || "image/jpeg");
      if (req.error || !req.uploadUrl || !req.storageKey) return setError(req.error || "Couldn't start the upload.");
      const put = await fetch(req.uploadUrl, { method: "PUT", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob });
      if (!put.ok) return setError("The photo upload failed. Please try again.");
      setPhotos((p) => [...p, { key: req.storageKey!, caption: "", previewUrl: URL.createObjectURL(blob), isNew: true }]);
    } catch {
      setError("Couldn't upload that photo. Please try again.");
    } finally {
      setBusy("");
      if (cameraRef.current) cameraRef.current.value = "";
      if (libraryRef.current) libraryRef.current.value = "";
    }
  }

  // Removing a photo that was already saved only takes effect when the report is saved; a brand-new one is deleted now.
  function removePhoto(key: string) {
    const gone = photos.find((p) => p.key === key);
    if (gone?.isNew) void discardOmPhoto(projectId, key);
    setPhotos((p) => p.filter((x) => x.key !== key));
  }

  function cancel() {
    photos.filter((p) => p.isNew).forEach((p) => void discardOmPhoto(projectId, p.key));
    onDone();
  }

  async function submit() {
    setError("");
    if (!jt) return setError("Pick what kind of job this was.");
    setSaving(true);
    try {
      const res = await saveOmReport(
        projectId,
        { date, jobType, extras, technician, data, photos: photos.map((p) => ({ key: p.key, caption: p.caption })), signature },
        initial?.id
      );
      if (res.error) return setError(res.error);
      onDone();
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const headerFields = OM_HEADER_FIELDS.filter((f) => !f.officeOnly || isAdmin);

  return (
    <div style={{ marginBottom: 18, borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
      {editing && <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 12 }}>Fixing a mistake on this report. It will be marked as edited.</p>}

      <label style={labelStyle}>What kind of job was this?</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8, marginBottom: 16 }}>
        {OM_JOB_TYPES.map((j) => (
          <button
            key={j.id}
            type="button"
            onClick={() => pickJobType(j.id)}
            aria-pressed={jobType === j.id}
            style={{ ...jobBtnStyle, ...(jobType === j.id ? jobBtnOnStyle : null) }}
          >
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{j.label}</span>
            <span style={{ fontSize: "0.72rem", opacity: 0.8, marginTop: 2 }}>{j.blurb}</span>
          </button>
        ))}
      </div>

      {jt && (
        <>
          <datalist id={listId}>
            {people.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          <Bar title="Job" />
          <div style={gridStyle}>
            <Field label="Date performed" required>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </Field>
            {headerFields.map((f) => (
              <Field key={f.key} label={f.label} required={f.key === "address"} wide={f.wide}>
                <FieldInput f={f} value={data[f.key]} onChange={(v) => setValue(f.key, v)} />
              </Field>
            ))}
          </div>

          {sections.map((s) => (
            <div key={s.id}>
              <Bar title={s.title} hint={s.hint} onRemove={extras.includes(s.id) ? () => setExtras((x) => x.filter((id) => id !== s.id)) : undefined} />
              <div style={gridStyle}>
                {s.fields
                  .filter((f) => fieldVisible(f, data) && (!f.officeOnly || isAdmin))
                  .map((f) => (
                    <Field key={f.key} label={f.label} wide={f.wide || f.type === "checks" || f.type === "rows" || f.type === "textarea"}>
                      <FieldInput f={f} value={data[f.key]} onChange={(v) => setValue(f.key, v)} />
                    </Field>
                  ))}
              </div>
            </div>
          ))}

          {addable.length > 0 && (
            <div style={{ margin: "4px 0 18px" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Need something else on this report?</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {addable.map((s) => (
                  <button key={s.id} type="button" onClick={() => setExtras((x) => [...x, s.id])} style={addBtnStyle}>
                    + {OM_SECTIONS[s.id].title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Bar title="What was done" />
          <Field label={OM_NARRATIVE.label} required wide>
            <FieldInput f={OM_NARRATIVE} value={data.narrative} onChange={(v) => setValue("narrative", v)} />
          </Field>

          <Bar title={`Pictures (${photos.length}/${MAX_OM_PHOTOS})`} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" aria-label="Take a photo" style={hiddenInput} onChange={(e) => void addPhoto(e.target.files?.[0])} />
          <input ref={libraryRef} type="file" accept="image/*" aria-label="Choose a photo" style={hiddenInput} onChange={(e) => void addPhoto(e.target.files?.[0])} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button type="button" disabled={!!busy || photos.length >= MAX_OM_PHOTOS} onClick={() => cameraRef.current?.click()} style={addBtnStyle}>
              📷 Take photo
            </button>
            <button type="button" disabled={!!busy || photos.length >= MAX_OM_PHOTOS} onClick={() => libraryRef.current?.click()} style={addBtnStyle}>
              Choose from phone
            </button>
            {busy && <span style={{ fontSize: "0.8rem", color: "var(--muted)", alignSelf: "center" }}>{busy}</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginBottom: 18 }}>
            {photos.map((p, i) => (
              <div key={p.key} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8, background: "var(--bg)" }}>
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.previewUrl} alt={`Photo ${i + 1}`} style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 6 }} />
                ) : (
                  <div style={{ height: 130, display: "grid", placeItems: "center", color: "var(--muted)", fontSize: "0.78rem" }}>Loading…</div>
                )}
                <input
                  type="text"
                  value={p.caption}
                  placeholder={`Pic ${i + 1} caption`}
                  onChange={(e) => setPhotos((cur) => cur.map((x) => (x.key === p.key ? { ...x, caption: e.target.value } : x)))}
                  style={{ ...inputStyle, marginTop: 6 }}
                />
                <button type="button" onClick={() => removePhoto(p.key)} style={{ ...linkBtnStyle, marginTop: 4 }}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          <Bar title="Sign-off" />
          <div style={gridStyle}>
            <Field label="Name of tech" required wide>
              <input type="text" list={listId} autoComplete="off" placeholder="Pick a name or type a new one" value={technician} onChange={(e) => setTechnician(e.target.value)} style={inputStyle} />
            </Field>
          </div>
          <label style={labelStyle}>Signature</label>
          <SignaturePad value={signature} onChange={setSignature} />
        </>
      )}

      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: "12px 0" }}>{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
        <button type="button" onClick={cancel} style={secondaryBtnStyle}>
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={saving || !jt || !!busy} style={{ ...primaryBtnStyle, opacity: !jt ? 0.5 : 1 }}>
          {saving ? "Saving…" : editing ? "Save Changes" : "Submit Report"}
        </button>
      </div>
    </div>
  );
}

function FieldInput({ f, value, onChange }: { f: OmField; value: OmValue | undefined; onChange: (v: OmValue | undefined) => void }) {
  const str = typeof value === "string" ? value : "";
  switch (f.type) {
    case "textarea":
      return <textarea rows={4} value={str} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, resize: "vertical" }} />;
    case "number":
      return <input type="number" inputMode="decimal" step="any" min="0" value={str} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
    case "date":
    case "time":
      return <input type={f.type} value={str} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
    case "text":
      return <input type="text" value={str} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} style={inputStyle} />;
    case "choice":
    case "yesno": {
      const options = f.type === "yesno" ? ["Yes", "No"] : f.options!;
      return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {options.map((o) => (
            <button key={o} type="button" aria-pressed={str === o} onClick={() => onChange(str === o ? undefined : o)} style={{ ...chipBtnStyle, ...(str === o ? chipBtnOnStyle : null) }}>
              {o}
            </button>
          ))}
        </div>
      );
    }
    case "checks": {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div style={{ display: "grid", gap: 6 }}>
          {f.options!.map((o) => (
            <label key={o} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.85rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={picked.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))}
                style={{ marginTop: 3 }}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case "rows": {
      const rows = Array.isArray(value) ? (value as Record<string, string>[]) : [];
      const shown = rows.length ? rows : [{}];
      const set = (i: number, key: string, v: string) => onChange(shown.map((r, j) => (j === i ? { ...r, [key]: v } : r)) as Record<string, string>[]);
      return (
        <div>
          {shown.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: `repeat(${f.columns!.length}, 1fr) auto`, gap: 8, marginBottom: 8 }}>
              {f.columns!.map((c) => (
                <input key={c.key} type="text" placeholder={c.label} value={r[c.key] || ""} onChange={(e) => set(i, c.key, e.target.value)} style={inputStyle} />
              ))}
              <button type="button" aria-label="Remove row" onClick={() => onChange(shown.filter((_, j) => j !== i) as Record<string, string>[])} style={deleteBtnStyle}>
                ×
              </button>
            </div>
          ))}
          <button type="button" onClick={() => onChange([...shown, {}] as Record<string, string>[])} style={addBtnStyle}>
            + Add another
          </button>
        </div>
      );
    }
  }
}

// Sign with a finger or mouse. Stores a small PNG; "Clear" starts over.
function SignaturePad({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [redraw, setRedraw] = useState(!value);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = ref.current!.getContext("2d")!;
    ref.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(ref.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current;
    if (c) c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    onChange(null);
    setRedraw(true);
  };

  return (
    <div style={{ marginBottom: 6 }}>
      {value && !redraw ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Saved signature" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, maxWidth: "100%", height: 120 }} />
      ) : (
        <canvas
          ref={ref}
          width={700}
          height={200}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          style={{ width: "100%", maxWidth: 520, height: "auto", aspectRatio: "7 / 2", background: "#fff", border: "1px solid var(--border)", borderRadius: 8, touchAction: "none", display: "block" }}
        />
      )}
      <button type="button" onClick={clear} style={{ ...linkBtnStyle, marginTop: 4 }}>
        {value && !redraw ? "Sign again" : "Clear"}
      </button>
    </div>
  );
}

function Bar({ title, hint, onRemove }: { title: string; hint?: string; onRemove?: () => void }) {
  return (
    <div style={{ margin: "6px 0 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-2)", borderLeft: "4px solid #5aa9e6", borderRadius: 4, padding: "7px 12px" }}>
        <strong style={{ fontSize: "0.82rem", textTransform: "uppercase" }}>{title}</strong>
        {onRemove && (
          <button type="button" onClick={onRemove} style={linkBtnStyle}>
            Remove section
          </button>
        )}
      </div>
      {hint && <p style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4, gridColumn: wide ? "1 / -1" : undefined }}>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: "var(--danger)" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 };
const hiddenInput: React.CSSProperties = { position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" };
const addBtnStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--ink)", padding: "6px 13px", borderRadius: 6, fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" };
const deleteBtnStyle: React.CSSProperties = { background: "none", border: "1px solid var(--border)", borderRadius: 5, width: 30, cursor: "pointer", color: "var(--muted)" };
const linkBtnStyle: React.CSSProperties = { background: "none", border: "none", color: "var(--muted)", textDecoration: "underline", cursor: "pointer", fontSize: "0.76rem", padding: 0 };
const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", fontSize: "0.85rem", color: "var(--ink)", fontFamily: "inherit", width: "100%" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", marginBottom: 5 };
const primaryBtnStyle: React.CSSProperties = { background: "var(--rust)", color: "var(--rust-ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const secondaryBtnStyle: React.CSSProperties = { background: "var(--surface-2)", color: "var(--ink)", border: "none", borderRadius: 6, padding: "9px 16px", fontWeight: 600, cursor: "pointer", fontSize: "0.88rem" };
const jobBtnStyle: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", background: "var(--bg)", border: "2px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" };
const jobBtnOnStyle: React.CSSProperties = { borderColor: "var(--rust)", background: "var(--surface-2)" };
const chipBtnStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 20, padding: "6px 14px", fontSize: "0.82rem", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" };
const chipBtnOnStyle: React.CSSProperties = { background: "var(--rust)", borderColor: "var(--rust)", color: "var(--rust-ink)", fontWeight: 600 };
