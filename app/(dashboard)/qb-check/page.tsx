import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getSessionAndProfile } from "@/lib/auth/current-user";
import { requireCompany } from "@/lib/auth/company";
import { getConnection, qbConfig } from "@/lib/quickbooks";
import { listQbJobs } from "@/lib/qb-jobs";
import { compareJobs, nextProjectNumber } from "@/lib/qb-compare";
import CheckView from "./check-view";

export const dynamic = "force-dynamic";

export default async function QbCheckPage() {
  const current = await getSessionAndProfile();
  if (current?.profile.role !== "admin") redirect("/board");
  const company = await requireCompany();

  const box = (children: React.ReactNode) => (
    <section>
      <h2 style={{ marginBottom: 8 }}>QuickBooks check</h2>
      {children}
    </section>
  );
  if (company.id !== "fwi") return box(<p style={{ color: "var(--muted)" }}>This check works for Feliciana Welders only for now. Switch company at the top right.</p>);
  if (!qbConfig().configured) return box(<p style={{ color: "var(--muted)" }}>QuickBooks isn&apos;t set up for White Board yet.</p>);
  if (!(await getConnection(company.id))) {
    return box(
      <p>
        QuickBooks isn&apos;t connected for this company.{" "}
        <a href="/api/quickbooks/connect?returnTo=/qb-check" style={{ textDecoration: "underline" }}>
          Connect QuickBooks
        </a>
      </p>
    );
  }

  let error = "";
  let qbJobs: Awaited<ReturnType<typeof listQbJobs>> = [];
  try {
    qbJobs = await listQbJobs(company.id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't read QuickBooks.";
  }
  const wb = await db.select().from(projects).where(eq(projects.companyId, company.id));
  const yy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(2, 4);
  const check = compareJobs(
    wb.map((p) => ({ id: p.id, name: p.name, projectNumber: p.projectNumber, status: p.status, jobKind: p.jobKind, customer: p.customer })),
    qbJobs,
    yy
  );
  const next = nextProjectNumber(yy, qbJobs.map((j) => j.number), wb.map((p) => p.projectNumber));

  return (
    <section>
      <h2 style={{ marginBottom: 6 }}>QuickBooks check</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: 16 }}>
        Feliciana Welders · compares White Board&apos;s jobs with QuickBooks&apos; numbered jobs, live. <Link href="/board" style={{ textDecoration: "underline" }}>Back to Board</Link>
      </p>
      {error ? (
        <p style={{ color: "var(--danger)" }}>{error}</p>
      ) : (
        <CheckView
          qbCount={qbJobs.length}
          next={next}
          check={{
            matched: check.matched,
            qbOnly: check.qbOnly,
            wbNotInQb: check.wbNotInQb.map((p) => ({ id: p.id, name: p.name, number: p.projectNumber, customer: p.customer, status: p.status })),
            wbNoNumber: check.wbNoNumber.map((p) => ({ id: p.id, name: p.name, number: p.projectNumber, customer: p.customer, status: p.status })),
            nameDiffs: check.nameDiffs.map((d) => ({ number: d.qb.number, wb: d.wb.name, qb: d.qb.name })),
          }}
        />
      )}
    </section>
  );
}
