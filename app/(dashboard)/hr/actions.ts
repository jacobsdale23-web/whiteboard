"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { crew, hrCandidates, hrDrugTests, hrEmployees, hrOqQuals, oqExamTasks } from "@/lib/db/schema";
import { canSeeHR, getSessionAndProfile } from "@/lib/auth/current-user";
import { deleteObject, getDownloadUrl, getUploadUrl } from "@/lib/storage/s3";
import {
  CANDIDATE_STAGES,
  DA_PROGRAM,
  EMPLOYEE_STATUSES,
  HR_UPLOAD_TYPES,
  SUBSTANCES,
  TEST_STATUSES,
  TEST_TYPES,
  preEmploymentState,
  today,
} from "@/lib/hr";

type Result = { error?: string; id?: string };

// Every HR action re-checks access on the server; hiding the nav link is not protection.
async function requireHR() {
  const current = await getSessionAndProfile();
  if (!current || !canSeeHR(current.profile)) return null;
  return current;
}
const DENIED: Result = { error: "Only admins and HR can do that." };

const clean = (s: unknown) => String(s ?? "").trim();
const orNull = (s: unknown) => clean(s) || null;
const oneOf = (list: readonly { value: string }[], v: string, fallback: string) => (list.some((x) => x.value === v) ? v : fallback);
const isoDate = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(s)) ? clean(s) : null);

function refresh() {
  revalidatePath("/hr", "layout");
}

// ---------- candidates ----------

export type CandidateInput = {
  companyId: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  position: string;
  source: string;
  stage: string;
  appliedDate: string;
  notes: string;
};

export async function saveCandidate(id: string | null, data: CandidateInput): Promise<Result> {
  if (!(await requireHR())) return DENIED;
  const name = clean(data.name);
  if (!name) return { error: "Name is required." };
  if (!clean(data.companyId)) return { error: "Pick the company they applied to." };
  const values = {
    companyId: clean(data.companyId),
    name,
    phone: orNull(data.phone),
    email: orNull(data.email),
    address: orNull(data.address),
    position: orNull(data.position),
    source: orNull(data.source),
    stage: oneOf(CANDIDATE_STAGES, data.stage, "applied"),
    appliedDate: isoDate(data.appliedDate) ?? today(),
    notes: orNull(data.notes),
    updatedAt: new Date(),
  };
  if (id) {
    await db.update(hrCandidates).set(values).where(eq(hrCandidates.id, id));
    refresh();
    return { id };
  }
  const newId = randomUUID();
  await db.insert(hrCandidates).values({ id: newId, ...values });
  refresh();
  return { id: newId };
}

export async function setCandidateStage(id: string, stage: string): Promise<Result> {
  if (!(await requireHR())) return DENIED;
  if (!CANDIDATE_STAGES.some((s) => s.value === stage)) return { error: "Unknown stage." };
  if (stage === "hired") return { error: "Use the Hire button so an employee record is created." };
  await db.update(hrCandidates).set({ stage, updatedAt: new Date() }).where(eq(hrCandidates.id, id));
  refresh();
  return {};
}

async function deleteTestsWhere(condition: ReturnType<typeof eq>) {
  const tests = await db.select().from(hrDrugTests).where(condition);
  for (const t of tests) if (t.storageKey) await deleteObject(t.storageKey);
  await db.delete(hrDrugTests).where(condition);
}

export async function deleteCandidate(id: string): Promise<Result> {
  if (!(await requireHR())) return DENIED;
  const c = await db.query.hrCandidates.findFirst({ where: eq(hrCandidates.id, id) });
  if (!c) return {};
  if (c.employeeId) return { error: "This candidate was hired. Remove the employee record instead." };
  await deleteTestsWhere(eq(hrDrugTests.candidateId, id));
  await db.delete(hrCandidates).where(eq(hrCandidates.id, id));
  refresh();
  return {};
}

// Turns a candidate into an employee. Without a negative pre-employment test
// on file this refuses, unless HR explicitly overrides it.
export async function hireCandidate(id: string, opts: { hireDate: string; position: string; override: boolean }): Promise<Result> {
  if (!(await requireHR())) return DENIED;
  const c = await db.query.hrCandidates.findFirst({ where: eq(hrCandidates.id, id) });
  if (!c) return { error: "Candidate not found." };
  if (c.employeeId) return { error: "Already hired." };

  const tests = await db.select().from(hrDrugTests).where(eq(hrDrugTests.candidateId, id));
  const cleared = preEmploymentState(tests) === "cleared";
  if (!cleared && !opts.override) return { error: "No negative pre-employment drug test is on file." };

  const hireDate = isoDate(opts.hireDate) ?? today();
  const employeeId = randomUUID();
  await db.insert(hrEmployees).values({
    id: employeeId,
    companyId: c.companyId,
    name: c.name,
    position: orNull(opts.position) ?? c.position,
    phone: c.phone,
    email: c.email,
    address: c.address,
    hireDate,
    status: "active",
    daProgram: cleared ? "active" : "pending",
    daEnrolledDate: cleared ? hireDate : null,
    notes: c.notes,
    candidateId: id,
  });
  // The pre-employment records follow the person from here on.
  if (tests.length) await db.update(hrDrugTests).set({ employeeId }).where(eq(hrDrugTests.candidateId, id));
  await db.update(hrCandidates).set({ stage: "hired", employeeId, updatedAt: new Date() }).where(eq(hrCandidates.id, id));
  refresh();
  return { id: employeeId };
}

// ---------- employees ----------

export type EmployeeInput = {
  companyId: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  personalEmail: string;
  address: string;
  hireDate: string;
  status: string;
  terminatedDate: string;
  daProgram: string;
  daEnrolledDate: string;
  notes: string;
};

export async function saveEmployee(id: string | null, data: EmployeeInput): Promise<Result> {
  if (!(await requireHR())) return DENIED;
  const name = clean(data.name);
  if (!name) return { error: "Name is required." };
  if (!clean(data.companyId)) return { error: "Pick the company they work for." };
  const status = oneOf(EMPLOYEE_STATUSES, data.status, "active");
  const daProgram = oneOf(DA_PROGRAM, data.daProgram, "pending");
  const values = {
    companyId: clean(data.companyId),
    name,
    position: orNull(data.position),
    phone: orNull(data.phone),
    email: orNull(data.email),
    personalEmail: orNull(data.personalEmail),
    address: orNull(data.address),
    hireDate: isoDate(data.hireDate),
    status,
    terminatedDate: status === "terminated" ? isoDate(data.terminatedDate) ?? today() : null,
    daProgram,
    daEnrolledDate: daProgram === "active" ? isoDate(data.daEnrolledDate) ?? today() : isoDate(data.daEnrolledDate),
    notes: orNull(data.notes),
  };
  if (id) {
    await db.update(hrEmployees).set(values).where(eq(hrEmployees.id, id));
    refresh();
    return { id };
  }
  const newId = randomUUID();
  await db.insert(hrEmployees).values({ id: newId, ...values });
  refresh();
  return { id: newId };
}

// Deleting erases the testing and qualification history too, so admins only.
export async function deleteEmployee(id: string): Promise<Result> {
  const current = await requireHR();
  if (!current || current.profile.role !== "admin") return { error: "Only admins can delete an employee record. Mark them terminated instead." };
  await deleteTestsWhere(eq(hrDrugTests.employeeId, id));
  await db.delete(hrOqQuals).where(eq(hrOqQuals.employeeId, id));
  await db.update(hrCandidates).set({ employeeId: null }).where(eq(hrCandidates.employeeId, id));
  await db.delete(hrEmployees).where(eq(hrEmployees.id, id));
  refresh();
  return {};
}

// One-time helper: start the roster from the crew names each company already
// has for daily logs. HR fills in the rest afterwards.
export async function importFromCrew(companyId: string): Promise<Result & { added?: number }> {
  if (!(await requireHR())) return DENIED;
  const [people, existing] = await Promise.all([
    db.select().from(crew).where(and(eq(crew.companyId, companyId), eq(crew.active, true))),
    db.select().from(hrEmployees).where(eq(hrEmployees.companyId, companyId)),
  ]);
  const have = new Set(existing.map((e) => e.name.trim().toLowerCase()));
  const fresh = people.filter((p) => !have.has(p.name.trim().toLowerCase()));
  for (const p of fresh) {
    await db.insert(hrEmployees).values({
      id: randomUUID(),
      companyId,
      name: p.name.trim(),
      position: p.role === "foreman" ? "Foreman" : null,
      status: "active",
      daProgram: "pending",
    });
  }
  refresh();
  return { added: fresh.length };
}

// ---------- drug & alcohol tests ----------

export async function requestHrUpload(filename: string): Promise<{ error?: string; uploadUrl?: string; storageKey?: string; contentType?: string }> {
  if (!(await requireHR())) return DENIED;
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const contentType = HR_UPLOAD_TYPES[ext];
  if (!contentType) return { error: "Documents can be a PDF or a photo (JPG, PNG, HEIC)." };
  const storageKey = `hr/${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  return { uploadUrl: await getUploadUrl(storageKey, contentType), storageKey, contentType };
}

export type DrugTestInput = {
  candidateId?: string;
  employeeId?: string;
  testType: string;
  substance: string;
  orderedDate: string;
  collectedDate: string;
  resultDate: string;
  facility: string;
  status: string;
  notes: string;
  upload?: { storageKey: string; filename: string; contentType: string };
  removeDocument?: boolean;
};

export async function saveDrugTest(id: string | null, data: DrugTestInput): Promise<Result> {
  const current = await requireHR();
  if (!current) return DENIED;
  if (!data.candidateId && !data.employeeId) return { error: "Missing the person this test is for." };
  if (data.upload && !data.upload.storageKey.startsWith("hr/")) return { error: "Invalid file." };

  const status = oneOf(TEST_STATUSES, data.status, "ordered");
  const final = ["negative", "positive", "refused"].includes(status);
  const values = {
    testType: oneOf(TEST_TYPES, data.testType, "pre_employment"),
    substance: oneOf(SUBSTANCES, data.substance, "both"),
    orderedDate: isoDate(data.orderedDate),
    collectedDate: isoDate(data.collectedDate),
    resultDate: final ? isoDate(data.resultDate) ?? today() : isoDate(data.resultDate),
    facility: orNull(data.facility),
    status,
    notes: orNull(data.notes),
  };

  let testId = id;
  if (id) {
    const existing = await db.query.hrDrugTests.findFirst({ where: eq(hrDrugTests.id, id) });
    if (!existing) return { error: "That test no longer exists." };
    let doc: { storageKey: string | null; filename: string | null; contentType: string | null } = { storageKey: existing.storageKey, filename: existing.filename, contentType: existing.contentType };
    if (data.upload) {
      if (existing.storageKey) await deleteObject(existing.storageKey);
      doc = data.upload;
    } else if (data.removeDocument && existing.storageKey) {
      await deleteObject(existing.storageKey);
      doc = { storageKey: null, filename: null, contentType: null };
    }
    await db.update(hrDrugTests).set({ ...values, ...doc }).where(eq(hrDrugTests.id, id));
  } else {
    testId = randomUUID();
    await db.insert(hrDrugTests).values({
      id: testId,
      candidateId: data.candidateId ?? null,
      employeeId: data.employeeId ?? null,
      ...values,
      storageKey: data.upload?.storageKey ?? null,
      filename: data.upload?.filename ?? null,
      contentType: data.upload?.contentType ?? null,
      createdBy: current.profile.name,
    });
  }

  // A negative pre-employment test is what moves a new hire into the testing program.
  if (data.employeeId && values.testType === "pre_employment" && status === "negative") {
    const emp = await db.query.hrEmployees.findFirst({ where: eq(hrEmployees.id, data.employeeId) });
    if (emp && emp.daProgram === "pending") {
      await db.update(hrEmployees).set({ daProgram: "active", daEnrolledDate: values.resultDate ?? today() }).where(eq(hrEmployees.id, emp.id));
    }
  }

  refresh();
  return { id: testId ?? undefined };
}

export async function deleteDrugTest(id: string): Promise<Result> {
  if (!(await requireHR())) return DENIED;
  const t = await db.query.hrDrugTests.findFirst({ where: eq(hrDrugTests.id, id) });
  if (!t) return {};
  if (t.storageKey) await deleteObject(t.storageKey);
  await db.delete(hrDrugTests).where(eq(hrDrugTests.id, id));
  refresh();
  return {};
}

export async function getHrDocumentUrl(testId: string): Promise<{ error?: string; url?: string }> {
  if (!(await requireHR())) return { error: "Only admins and HR can open these documents." };
  const t = await db.query.hrDrugTests.findFirst({ where: eq(hrDrugTests.id, testId) });
  if (!t?.storageKey) return { error: "No document attached." };
  return { url: await getDownloadUrl(t.storageKey) };
}

// ---------- OQ qualifications ----------

export async function saveOqQual(
  employeeId: string,
  data: { taskCode: string; qualifiedDate: string; expiresDate: string; notes: string }
): Promise<Result> {
  if (!(await requireHR())) return DENIED;
  const taskCode = clean(data.taskCode);
  const qualifiedDate = isoDate(data.qualifiedDate);
  if (!taskCode) return { error: "Pick the task." };
  if (!qualifiedDate) return { error: "Enter the date they qualified." };

  const task = await db.query.oqExamTasks.findFirst({ where: eq(oqExamTasks.taskCode, taskCode) });
  if (!task) return { error: "Unknown OQ task." };

  const values = { taskName: task.taskName, qualifiedDate, expiresDate: isoDate(data.expiresDate), notes: orNull(data.notes) };
  const existing = await db.query.hrOqQuals.findFirst({ where: and(eq(hrOqQuals.employeeId, employeeId), eq(hrOqQuals.taskCode, taskCode)) });
  if (existing) await db.update(hrOqQuals).set(values).where(eq(hrOqQuals.id, existing.id));
  else await db.insert(hrOqQuals).values({ id: randomUUID(), employeeId, taskCode, ...values });
  refresh();
  return {};
}

export async function deleteOqQual(id: string): Promise<Result> {
  if (!(await requireHR())) return DENIED;
  await db.delete(hrOqQuals).where(eq(hrOqQuals.id, id));
  refresh();
  return {};
}

// Several tasks qualified on the same day (a typical OQ evaluation covers a group of tasks).
export async function saveOqQualBatch(
  employeeId: string,
  data: { taskCodes: string[]; qualifiedDate: string; expiresDate: string }
): Promise<Result> {
  if (!(await requireHR())) return DENIED;
  if (!data.taskCodes.length) return { error: "Pick at least one task." };
  const valid = await db.select().from(oqExamTasks).where(inArray(oqExamTasks.taskCode, data.taskCodes));
  if (!valid.length) return { error: "Unknown OQ tasks." };
  for (const code of new Set(valid.map((t) => t.taskCode))) {
    const res = await saveOqQual(employeeId, { taskCode: code, qualifiedDate: data.qualifiedDate, expiresDate: data.expiresDate, notes: "" });
    if (res.error) return res;
  }
  return {};
}
