import { getConnection, QbError, qbApi, qbGraphql, qbProjectsEnabled, qbQuery, qbQuote } from "@/lib/quickbooks";
import { parseJobName, type QbJobLite } from "@/lib/qb-compare";
import { matchCustomers, qbCustomerName } from "@/lib/qb-customer-match";

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

// Every top-level customer in QuickBooks (not jobs), active or not.
async function listTopCustomers(companyId: string): Promise<QbCustomerFull[]> {
  const out: QbCustomerFull[] = [];
  for (let start = 1; start < 5000; start += 500) {
    const page = await qbQuery<QbCustomerFull>(companyId, `select Id, DisplayName, Active, Job from Customer where Job = false and Active in (true, false) startposition ${start} maxresults 500`, "Customer");
    out.push(...page);
    if (page.length < 500) break;
  }
  return out;
}

// The customer a new job goes under. The White Board customer name is used as given: a QuickBooks customer with the same name
// (ignoring case, punctuation, word order and Inc/LLC) is used, and when there is none the customer is created with just a name
// (no email, phone or address). `near` lists similar customers that were NOT used, so a possible duplicate can be merged by hand.
// A string result is the reason it couldn't be done.
export async function resolveParentCustomer(companyId: string, wanted: string): Promise<{ Id: string; DisplayName: string; created: boolean; near: string[] } | string> {
  const name = qbCustomerName(wanted);
  if (!name) return "The project has no customer name.";
  const tops = await listTopCustomers(companyId);
  const { exact, near } = matchCustomers(name, tops.map((c) => c.DisplayName));
  if (exact.length) {
    const hits = tops.filter((c) => exact.includes(c.DisplayName));
    const verbatim = hits.filter((c) => c.DisplayName.toLowerCase() === name.toLowerCase());
    const pick = verbatim.length === 1 ? verbatim[0] : hits.length === 1 ? hits[0] : null;
    if (!pick) return `QuickBooks has more than one customer that looks like "${name}" (${hits.map((h) => h.DisplayName).join("; ")}). Set the project's customer to the exact one you want.`;
    if (pick.Active === false) return `The QuickBooks customer "${pick.DisplayName}" is inactive. Make it active in QuickBooks (or change the project's customer), then try again.`;
    return { Id: pick.Id, DisplayName: pick.DisplayName, created: false, near: [] };
  }
  const created = await qbApi<{ Customer?: QbCustomerFull }>(companyId, "POST", "/customer", { DisplayName: name });
  if (!created.Customer?.Id) throw new Error("QuickBooks didn't confirm the new customer.");
  return { Id: created.Customer.Id, DisplayName: created.Customer.DisplayName || name, created: true, near: near.filter((n) => tops.find((c) => c.DisplayName === n)?.Active !== false) };
}

const CREATE_PROJECT = `mutation ProjectManagementCreateProject($name: String!, $startDate: DateTime, $dueDate: DateTime!, $status: ProjectManagement_Status, $customer: ProjectManagement_CustomerInput, $account: ProjectManagement_CompanyInput!) {
  projectManagementCreateProject(input: { name: $name, startDate: $startDate, dueDate: $dueDate, status: $status, customer: $customer, account: $account }) {
    ... on ProjectManagement_Project { id name customer { id } }
  }
}`;

const isoDay = (d: string) => `${d}T00:00:00.000Z`;
const validDay = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

// A real QuickBooks Project under the customer, through Intuit's Projects API. QuickBooks also lists a Project as a
// customer (IsProject), and invoices are billed to that customer record, so its Customer id is looked up and returned.
async function createQbProject(companyId: string, displayName: string, parentId: string, dates: { start?: string | null; end?: string | null }): Promise<{ id: string; isProject: boolean | null }> {
  const year = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }).slice(0, 4);
  const start = validDay(dates.start);
  const due = validDay(dates.end) || `${year}-12-31`; // QuickBooks requires a due date
  const realmId = (await getConnection(companyId))?.realmId;
  if (!realmId) throw new QbError("QuickBooks isn't connected for this company.");
  const { data } = await qbGraphql<{ projectManagementCreateProject?: { id?: string } }>(companyId, "create project", CREATE_PROJECT, {
    name: displayName,
    ...(start ? { startDate: isoDay(start) } : {}),
    dueDate: isoDay(due < (start || "") ? start! : due),
    status: "OPEN",
    customer: { id: parentId },
    account: { id: realmId },
  });
  const projectId = data.projectManagementCreateProject?.id;
  if (!projectId) throw new QbError("QuickBooks didn't confirm the new project.");
  for (let i = 0; i < 3; i++) {
    const found = await qbQuery<QbCustomerFull>(companyId, `select * from Customer where DisplayName = '${qbQuote(displayName)}'`, "Customer");
    if (found[0]?.Id) return { id: found[0].Id, isProject: typeof found[0].IsProject === "boolean" ? found[0].IsProject : true };
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { id: projectId, isProject: true };
}

// Creates the job under its customer: a real Project when the Projects API is switched on (see qbProjectsEnabled),
// otherwise a sub-customer as before. If the Projects API turns it down, it falls back to a sub-customer and says so
// in `note`. Returns the Customer id to bill to plus whether QuickBooks treats it as a Project.
export async function createQbJob(
  companyId: string,
  displayName: string,
  parentId: string,
  dates: { start?: string | null; end?: string | null } = {}
): Promise<{ id: string; isProject: boolean | null; note?: string }> {
  let note: string | undefined;
  if (qbProjectsEnabled()) {
    try {
      return await createQbProject(companyId, displayName, parentId, dates);
    } catch (e) {
      note = `QuickBooks wouldn't create it as a Project (${e instanceof Error ? e.message : "unknown error"}), so it was made as a sub-customer instead. If the Projects permission was just turned on, connect QuickBooks again.`;
    }
  }
  const created = await qbApi<{ Customer?: QbCustomerFull }>(companyId, "POST", "/customer", {
    DisplayName: displayName,
    Job: true,
    ParentRef: { value: parentId },
    BillWithParent: false,
  });
  const id = created.Customer?.Id;
  if (!id) throw new Error("QuickBooks didn't confirm the new job.");
  return { id, isProject: typeof created.Customer?.IsProject === "boolean" ? created.Customer.IsProject : null, ...(note ? { note } : {}) };
}
