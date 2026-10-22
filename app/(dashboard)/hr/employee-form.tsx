"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveEmployee } from "./actions";
import { DA_PROGRAM, EMPLOYEE_STATUSES } from "@/lib/hr";
import { btn, grid2, input, label, primaryBtn } from "./hr-styles";

export type EmployeeRow = {
  id: string;
  companyId: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  personalEmail: string | null;
  address: string | null;
  hireDate: string | null;
  status: string;
  terminatedDate: string | null;
  daProgram: string;
  daEnrolledDate: string | null;
  notes: string | null;
};

type Company = { id: string; name: string };

// Adds an employee (collapsed behind a button) or edits one (always open).
export default function EmployeeForm({ employee, companies, defaultCompanyId }: { employee?: EmployeeRow; companies: Company[]; defaultCompanyId: string }) {
  const router = useRouter();
  const editing = !!employee;
  const [open, setOpen] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(fd: FormData) {
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      const res = await saveEmployee(employee?.id ?? null, {
        companyId: String(fd.get("companyId") || ""),
        name: String(fd.get("name") || ""),
        position: String(fd.get("position") || ""),
        phone: String(fd.get("phone") || ""),
        email: String(fd.get("email") || ""),
        personalEmail: String(fd.get("personalEmail") || ""),
        address: String(fd.get("address") || ""),
        hireDate: String(fd.get("hireDate") || ""),
        status: String(fd.get("status") || "active"),
        terminatedDate: String(fd.get("terminatedDate") || ""),
        daProgram: String(fd.get("daProgram") || "pending"),
        daEnrolledDate: String(fd.get("daEnrolledDate") || ""),
        notes: String(fd.get("notes") || ""),
      });
      if (res.error) return setError(res.error);
      if (editing) setSaved(true);
      else setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={primaryBtn}>
        + Add Employee
      </button>
    );
  }

  return (
    <form action={submit} style={editing ? undefined : { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <div style={grid2}>
        <Field text="Name *">
          <input name="name" required defaultValue={employee?.name} style={input} />
        </Field>
        <Field text="Company *">
          <select name="companyId" defaultValue={employee?.companyId ?? defaultCompanyId} style={input}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field text="Position">
          <input name="position" defaultValue={employee?.position ?? ""} style={input} />
        </Field>
        <Field text="Phone">
          <input name="phone" type="tel" defaultValue={employee?.phone ?? ""} style={input} />
        </Field>
        <Field text="Company email">
          <input name="email" type="email" defaultValue={employee?.email ?? ""} style={input} />
        </Field>
        <Field text="Personal email">
          <input name="personalEmail" type="email" defaultValue={employee?.personalEmail ?? ""} style={input} />
        </Field>
        <Field text="Address">
          <input name="address" defaultValue={employee?.address ?? ""} style={input} />
        </Field>
        <Field text="Hire date">
          <input name="hireDate" type="date" defaultValue={employee?.hireDate ?? ""} style={input} />
        </Field>
        <Field text="Employment status">
          <select name="status" defaultValue={employee?.status ?? "active"} style={input}>
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field text="Termination date (if terminated)">
          <input name="terminatedDate" type="date" defaultValue={employee?.terminatedDate ?? ""} style={input} />
        </Field>
        <Field text="Drug & alcohol program">
          <select name="daProgram" defaultValue={employee?.daProgram ?? "pending"} style={input}>
            {DA_PROGRAM.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field text="Enrolled in program on">
          <input name="daEnrolledDate" type="date" defaultValue={employee?.daEnrolledDate ?? ""} style={input} />
        </Field>
      </div>
      <Field text="Notes">
        <textarea name="notes" rows={3} defaultValue={employee?.notes ?? ""} style={{ ...input, resize: "vertical" }} />
      </Field>
      {error && <p style={{ color: "var(--danger)", fontSize: "0.85rem", marginBottom: 8 }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="submit" disabled={busy} style={primaryBtn}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add employee"}
        </button>
        {!editing && (
          <button type="button" onClick={() => setOpen(false)} style={btn}>
            Cancel
          </button>
        )}
        {saved && <span style={{ color: "var(--active)", fontSize: "0.85rem" }}>Saved.</span>}
      </div>
    </form>
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
