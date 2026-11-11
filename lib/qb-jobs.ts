import { qbApi, qbQuery, qbQuote } from "@/lib/quickbooks";
import { parseJobName, type QbJobLite } from "@/lib/qb-compare";

type QbCustomerFull = {
  Id: string;
  DisplayName: string;
  Active?: boolean;
  Job?: boolean;
  IsProject?: boolean;
  ParentRef?: { value: string; name?: string };
};

// Every numbered job in QuickBooks (sub-customers, which includes its Projects), active or not.
export async function listQbJobs(companyId: string): Promise<QbJobLite[]> {
  const out: QbJobLite[] = [];
  for (let start = 1; start < 5000; start += 500) {
    const page = await qbQuery<QbCustomerFull>(companyId, `select * from Customer where Job = true and Active in (true, false) startposition ${start} maxresults 500`, "Customer");
    for (const c of page) {
      const parsed = parseJobName(c.DisplayName || "");
      if (!parsed) continue;
      out.push({ id: c.Id, number: parsed.number, name: parsed.name, parent: c.ParentRef?.name ?? null, active: c.Active !== false, isProject: typeof c.IsProject === "boolean" ? c.IsProject : null });
    }
    if (page.length < 500) break;
  }
  return out;
}

// The customer a new job goes under. Matched by exact name only; a string result is the reason it couldn't be found.
export async function findParentCustomer(companyId: string, name: string): Promise<{ Id: string; DisplayName: string } | string> {
  const exact = await qbQuery<QbCustomerFull>(companyId, `select Id, DisplayName, Job from Customer where DisplayName = '${qbQuote(name)}'`, "Customer");
  const tops = exact.filter((c) => !c.Job);
  if (tops.length === 1) return tops[0];
  if (tops.length > 1) return `QuickBooks has more than one customer named "${name}".`;
  const close = await qbQuery<QbCustomerFull>(companyId, `select DisplayName, Job from Customer where DisplayName like '%${qbQuote(name.slice(0, 20))}%' maxresults 8`, "Customer");
  const names = close.filter((c) => !c.Job).map((c) => c.DisplayName);
  return `QuickBooks has no customer named "${name}".${names.length ? ` Close matches: ${names.join("; ")}.` : ""} Make the project's customer match exactly, or create the customer in QuickBooks first.`;
}

// Creates the job under its customer. Returns the new record plus whether QuickBooks treats it as a Project.
export async function createQbJob(companyId: string, displayName: string, parentId: string): Promise<{ id: string; isProject: boolean | null }> {
  const created = await qbApi<{ Customer?: QbCustomerFull }>(companyId, "POST", "/customer", {
    DisplayName: displayName,
    Job: true,
    ParentRef: { value: parentId },
    BillWithParent: false,
  });
  const id = created.Customer?.Id;
  if (!id) throw new Error("QuickBooks didn't confirm the new job.");
  return { id, isProject: typeof created.Customer?.IsProject === "boolean" ? created.Customer.IsProject : null };
}
