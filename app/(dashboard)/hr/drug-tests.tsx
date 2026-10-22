"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteDrugTest, getHrDocumentUrl, requestHrUpload, saveDrugTest } from "./actions";
import { PENDING_STATUSES, SUBSTANCES, TEST_STATUSES, TEST_TYPES, substanceLabel, testStatusLabel, testTypeLabel } from "@/lib/hr";
import { btn, chip, dangerBtn, grid2, input, label, primaryBtn, td, th, type Tone } from "./hr-styles";

export type TestRow = {
  id: string;
  testType: string;
  substance: string;
  orderedDate: string | null;
  collectedDate: string | null;
  resultDate: string | null;
  facility: string | null;
  status: string;
  notes: string | null;
  filename: string | null;
  createdBy: string;
};

const tone = (status: string): Tone =>
  status === "negative" ? "good" : status === "positive" || status === "refused" ? "bad" : PENDING_STATUSES.includes(status) ? "warn" : "muted";

// The testing log for one person (a candidate's pre-employment test, or an
// employee's random / post-accident / follow-up tests), with an optional result document.
export default function DrugTests({ subject, tests, defaultType }: { subject: { candidateId?: string; employeeId?: string }; tests: TestRow[]; defaultType: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<TestRow | "new" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [removeDoc, setRemoveDoc] = useState(false);
  const current = editing && editing !== "new" ? editing : null;

  function close() {
    setEditing(null);
    setError("");
    setRemoveDoc(false);
  }

  async function submit(fd: FormData) {
    setError("");
    setBusy(true);
    try {
      let upload: { storageKey: string; filename: string; contentType: string } | undefined;
      const file = fd.get("file");
      if (file instanceof File && file.size) {
        const req = await requestHrUpload(file.name);
        if (req.error || !req.uploadUrl || !req.storageKey || !req.contentType) return setError(req.error || "Couldn't start the upload.");
        const put = await fetch(req.uploadUrl, { method: "PUT", headers: { "Content-Type": req.contentType }, body: file });
        if (!put.ok) return setError("Upload to storage failed. Please try again.");
        upload = { storageKey: req.storageKey, filename: file.name, contentType: req.contentType };
      }
      const res = await saveDrugTest(current?.id ?? null, {
        ...subject,
        testType: String(fd.get("testType") || defaultType),
        substance: String(fd.get("substance") || "both"),
        orderedDate: String(fd.get("orderedDate") || ""),
        collectedDate: String(fd.get("collectedDate") || ""),
        resultDate: String(fd.get("resultDate") || ""),
        facility: String(fd.get("facility") || ""),
        status: String(fd.get("status") || "ordered"),
        notes: String(fd.get("notes") || ""),
        upload,
        removeDocument: removeDoc,
      });
      if (res.error) return setError(res.error);
      close();
      router.refresh();
    } catch {
      setError("Couldn't save that test. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function openDoc(id: string) {
    const res = await getHrDocumentUrl(id);
    if (res.url) window.open(res.url, "_blank");
    else setError(res.error || "Couldn't open the document.");
  }

  async function remove(id: string) {
    if (!confirm("Delete this test record (and its document)?")) return;
    const res = await deleteDrugTest(id);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ fontSize: "1.02rem", textTransform: "uppercase" }}>Drug &amp; alcohol tests</h3>
        {!editing && (
          <button onClick={() => setEditing("new")} style={btn}>
            + Add test
          </button>
        )}
      </div>

      {editing && (
        <form action={submit} style={{ background: "var(--surface-2)", borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={grid2}>
            <Field text="Test type">
              <select name="testType" defaultValue={current?.testType ?? defaultType} style={input}>
                {TEST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field text="Panel">
              <select name="substance" defaultValue={current?.substance ?? "both"} style={input}>
                {SUBSTANCES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field text="Status">
              <select name="status" defaultValue={current?.status ?? "ordered"} style={input}>
                {TEST_STATUSES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field text="Clinic / lab">
              <input name="facility" defaultValue={current?.facility ?? ""} style={input} />
            </Field>
            <Field text="Ordered">
              <input name="orderedDate" type="date" defaultValue={current?.orderedDate ?? new Date().toISOString().slice(0, 10)} style={input} />
            </Field>
            <Field text="Collected">
              <input name="collectedDate" type="date" defaultValue={current?.collectedDate ?? ""} style={input} />
            </Field>
            <Field text="Result received">
              <input name="resultDate" type="date" defaultValue={current?.resultDate ?? ""} style={input} />
            </Field>
            <Field text="Result document (PDF or photo)">
              <input ref={fileRef} name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,application/pdf,image/*" style={input} />
              {current?.filename && (
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.78rem", marginTop: 6 }}>
                  <input type="checkbox" checked={removeDoc} onChange={(e) => setRemoveDoc(e.target.checked)} />
                  Remove current document ({current.filename})
                </label>
              )}
            </Field>
          </div>
          <Field text="Notes (keep clinical detail out; status and dates only)">
            <textarea name="notes" rows={2} defaultValue={current?.notes ?? ""} style={{ ...input, resize: "vertical" }} />
          </Field>
          {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 8 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={busy} style={primaryBtn}>
              {busy ? "Saving…" : current ? "Save test" : "Add test"}
            </button>
            <button type="button" onClick={close} style={btn}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {!editing && error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 8 }}>{error}</p>}

      {tests.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Type</th>
                <th style={th}>Status</th>
                <th style={th}>Ordered</th>
                <th style={th}>Result</th>
                <th style={th}>Clinic</th>
                <th style={th}>Document</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id}>
                  <td style={td}>
                    <strong>{testTypeLabel(t.testType)}</strong>
                    <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>{substanceLabel(t.substance)}</div>
                  </td>
                  <td style={td}>
                    <span style={chip(tone(t.status))}>{testStatusLabel(t.status)}</span>
                  </td>
                  <td style={td}>{t.orderedDate || "—"}</td>
                  <td style={td}>{t.resultDate || "—"}</td>
                  <td style={td}>
                    {t.facility || "—"}
                    {t.notes && <div style={{ color: "var(--muted)", fontSize: "0.76rem" }}>{t.notes}</div>}
                  </td>
                  <td style={td}>
                    {t.filename ? (
                      <button onClick={() => openDoc(t.id)} style={btn}>
                        View
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    <button onClick={() => setEditing(t)} style={btn}>
                      Edit
                    </button>{" "}
                    <button onClick={() => remove(t.id)} style={dangerBtn}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No tests on file yet.</p>
      )}
    </div>
  );
}

function Field({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={label}>{text}</label>
      {children}
    </div>
  );
}
