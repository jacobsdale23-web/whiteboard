import { pgTable, text, timestamp, numeric, jsonb, boolean, integer, primaryKey } from "drizzle-orm/pg-core";

// The parent company and its sister companies each get an identical White
// Board. Top-level records (projects, opportunities, crew names, equipment
// tickets) carry a company_id; everything under a project follows its project.
export const companies = pgTable("companies", {
  id: text("id").primaryKey(), // "fwi" | "om" | "pip" | "pgroup"
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Which companies a (non all-companies) user may open.
export const profileCompanies = pgTable(
  "profile_companies",
  {
    profileId: text("profile_id").notNull(),
    companyId: text("company_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.companyId] })]
);

// One row per Neon Auth user, created on first sign-in. `role` is what
// gates admin-only pages/actions on the server — never trust a client claim.
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(), // Neon Auth user id
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"), // "admin" | "member"
  // Mechanics (and admins) can see the Equipment tickets page; set on the Team page.
  isMechanic: boolean("is_mechanic").notNull().default(false),
  // Safety coordinators get a view-only account limited to projects, the
  // calendar, daily logs, JSAs and OQ practice tests (non-admins only).
  isSafety: boolean("is_safety").notNull().default(false),
  // Works across every company (and any added later) without per-company rows.
  allCompanies: boolean("all_companies").notNull().default(false),
  // HR users (like admins) can open the HR module: candidates, employees,
  // drug & alcohol testing and OQ qualifications. Non-admins only.
  isHR: boolean("is_hr").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Equipment trouble tickets a foreman files from a project so the mechanics
// know what is down and what might be wrong. Only admins and mechanics can
// read these; any signed-in user can file one.
export const equipmentTickets = pgTable("equipment_tickets", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  projectId: text("project_id").notNull(),
  reportedBy: text("reported_by").notNull(),
  date: text("date").notNull(),
  equipment: text("equipment").notNull(),
  urgency: text("urgency").notNull().default("repair_soon"), // down | repair_soon | minor
  problem: text("problem").notNull(),
  suspectedCause: text("suspected_cause"),
  status: text("status").notNull().default("open"), // open | in_progress | resolved
  mechanicNotes: text("mechanic_notes"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
  resolution: text("resolution"), // what the mechanic did to fix it
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// A parts invoice / receipt (with its dollar amount) attached to a ticket, so
// the cost of each repair can be tracked. The file itself lives in object storage.
export const equipmentTicketCosts = pgTable("equipment_ticket_costs", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  vendor: text("vendor"),
  description: text("description"),
  amount: numeric("amount").notNull().default("0"),
  storageKey: text("storage_key"),
  filename: text("filename"),
  contentType: text("content_type"),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedById: text("uploaded_by_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Every status change / mechanic note on a ticket, so admins can see who did
// what and when instead of just the latest note.
export const equipmentTicketUpdates = pgTable("equipment_ticket_updates", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull(),
  author: text("author").notNull(),
  status: text("status").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  location: text("location"),
  status: text("status").notNull().default("upcoming"), // "active" | "upcoming" | "on_hold" | "complete" | "billed" | "canceled"
  startDate: text("start_date"),
  endDate: text("end_date"),
  duration: text("duration"),
  value: numeric("value"),
  crew: jsonb("crew").$type<string[]>().default([]),
  billingType: text("billing_type").notNull().default("lump_sum"), // "lump_sum" | "tm" — gates the T&M Billing section
  // "YY-NNN" (e.g. 26-001), sequential by start order within the start
  // year. Only lump-sum/unit-price jobs use this — T&M jobs are tracked by
  // the client's own task/PO number instead (see billing_tasks). Assigned
  // automatically when a project becomes active; null before then.
  projectNumber: text("project_number"),
  customer: text("customer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const crew = pgTable("crew", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  role: text("role").notNull().default("foreman"), // "foreman" | "worker" — only foremen show up at the Shop
});

// Who has recently worked under which foreman (counted from submitted daily
// logs and JSAs). Powers the "Add usual crew" shortcut — it only suggests;
// foremen can always change the crew, since people move between foremen.
export const foremanCrews = pgTable("foreman_crews", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  foreman: text("foreman").notNull(),
  member: text("member").notNull(),
  times: numeric("times").notNull().default("1"),
  lastSeen: text("last_seen").notNull(), // YYYY-MM-DD
});

// ---------- per-project detail page ----------

export const milestones = pgTable("milestones", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  name: text("name").notNull(),
  date: text("date"),
  done: boolean("done").notNull().default(false),
  order: numeric("order").notNull().default("0"),
});

export const dailyLogs = pgTable("daily_logs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  date: text("date").notNull(),
  leakNumber: text("leak_number").notNull().default("N/A"),
  foreman: text("foreman"),
  lineItem: text("line_item"), // itemNo, references lineItems.itemNo for this project
  // Unit-price jobs: what the crew installed that day, by line item (several items per day). Compiled into the
  // pay app for the dates picked (see lib/production.ts).
  quantities: jsonb("quantities").$type<{ itemNo: string; qty: number }[]>().notNull().default([]),
  // Jobs billed from a quote: the foreman says the work differed from it (extra, changed or not done); the
  // description explains. The office sees these before billing.
  scopeChange: boolean("scope_change").notNull().default(false),
  crew: jsonb("crew").$type<{ name: string; position: string; hours: number }[]>().default([]),
  description: text("description"),
  address: text("address"), // job-site address for this entry (T&M billing)
  taskNumber: text("task_number"), // Atmos-style task/PO number (T&M billing) — references billing_tasks.taskNumber
  locusviewNumber: text("locusview_number"), // Locusview work-order number (T&M billing)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Set when someone corrects a log after it was submitted.
  editedAt: timestamp("edited_at"),
  editedBy: text("edited_by"),
});

// Daily Job Safety Analysis — filled out by the foreman before work starts,
// same open access as Daily Logs. Each crew member present taps to
// acknowledge (an on-device "initial") that they reviewed it.
export const jsaForms = pgTable("jsa_forms", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  date: text("date").notNull(),
  foreman: text("foreman"),
  weather: text("weather"),
  taskTypes: jsonb("task_types").$type<string[]>().default([]),
  hazards: jsonb("hazards").$type<{ taskType: string; hazard: string; control: string }[]>().default([]),
  ppe: jsonb("ppe").$type<string[]>().default([]),
  additionalHazards: text("additional_hazards"),
  emergencyInfo: text("emergency_info"),
  crew: jsonb("crew").$type<{ name: string; acknowledgedAt: string | null }[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- T&M billing (admin-only) ----------

// $/hr by crew position, per project — negotiated rates differ by contract.
export const billingRates = pgTable("billing_rates", {
  id: text("id").primaryKey(), // `${projectId}-${position}` slug
  projectId: text("project_id").notNull(),
  position: text("position").notNull(),
  hourlyRate: numeric("hourly_rate").notNull().default("0"),
});

// Leak numbers a project's foremen can pick from on a daily log. New ones
// are added straight from the log form, so the list grows as work comes in.
export const leakNumbers = pgTable("leak_numbers", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  leakNumber: text("leak_number").notNull(),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Persistent metadata for one recurring Atmos task/PO number, so weekly
// invoices don't require re-typing the contract details every time.
export const billingTasks = pgTable("billing_tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  taskNumber: text("task_number").notNull(),
  projectName: text("project_name"), // e.g. "2026 SIR Functional Leak Repair / MS26 Func Work"
  taskRequestNo: text("task_request_no"),
  contractCoordinator: text("contract_coordinator"),
  billToName: text("bill_to_name"),
  billToAddress: text("bill_to_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// A generated weekly invoice. `lineItems` is a frozen snapshot computed at
// generation time (from daily_logs), so editing logs later never changes
// an invoice that's already been reviewed/approved/sent.
export const tmInvoices = pgTable("tm_invoices", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  billingTaskId: text("billing_task_id").notNull(),
  invoiceNumber: text("invoice_number"),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  status: text("status").notNull().default("draft"), // draft | approved
  total: numeric("total").notNull().default("0"),
  lineItems: jsonb("line_items")
    .$type<
      {
        date: string;
        crewMember: string;
        position: string;
        leakNumber: string;
        locusviewNumber: string;
        address: string;
        hours: number;
        rate: number;
        amount: number;
      }[]
    >()
    .default([]),
  // Screening results from generation time: missing data, 17+ hour shifts,
  // and cross-crew overlaps. Frozen alongside lineItems for the same reason.
  warnings: jsonb("warnings")
    .$type<
      {
        severity: "error" | "warning";
        type: string;
        message: string;
        date: string;
        crewMember: string;
        // Which cells to highlight (data-consistency flags only).
        cells?: { date: string; crewMember: string; field: string; value?: string }[];
      }[]
    >()
    .default([]),
  // Flags the reviewer marked "not a mistake", keyed by lib/tm-ack.ts warningKey, with an optional note.
  acknowledged: jsonb("acknowledged").$type<{ key: string; note: string; at: string }[]>().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
  // Set once the approved invoice has been sent to QuickBooks (the invoice there is the one that goes to the customer).
  qbInvoiceId: text("qb_invoice_id"),
  qbSentAt: timestamp("qb_sent_at"),
  qbSentBy: text("qb_sent_by"),
});

// Public, price-free copy of each schedule-of-values line item, so field
// crew can pick a line item on a daily log without needing Budget access.
export const lineItems = pgTable("line_items", {
  id: text("id").primaryKey(), // `${projectId}-${itemNo}` slug
  projectId: text("project_id").notNull(),
  itemNo: text("item_no").notNull(),
  description: text("description"),
  unit: text("unit"),
  order: numeric("order").notNull().default("0"),
});

// ---------- budget (admin-only) ----------

export const expenses = pgTable("expenses", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  date: text("date"),
  description: text("description"),
  amount: numeric("amount").notNull().default("0"),
});

// Receipts a foreman photographs from a phone/iPad. The vendor, total and date
// are pre-read by AI and confirmed by the foreman. T&M jobs file them under
// Fuel / Food / Materials / Equipment (`category`); lump-sum/unit-price jobs
// file them against a line item (`lineItem` = itemNo). Counts toward the
// project's total cost. aiVendor/aiAmount keep what the AI read, so an admin
// can see when the foreman changed it.
export const receipts = pgTable("receipts", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  date: text("date"),
  vendor: text("vendor"),
  amount: numeric("amount").notNull().default("0"),
  category: text("category"),
  lineItem: text("line_item"),
  note: text("note"),
  storageKey: text("storage_key").notNull(),
  aiVendor: text("ai_vendor"),
  aiAmount: numeric("ai_amount"),
  submittedBy: text("submitted_by").notNull(),
  submittedById: text("submitted_by_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  invoiceNumber: text("invoice_number"),
  vendor: text("vendor"),
  date: text("date"),
  amount: numeric("amount").notNull().default("0"),
  category: text("category").notNull().default("Other"),
});

export const payApps = pgTable("pay_apps", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  appNumber: text("app_number").notNull(),
  period: text("period"),
  applicationDate: text("application_date"),
  retainagePercent: numeric("retainage_percent").notNull().default("5"),
  // Set when the quantities were compiled from daily logs: the first and last log date used, so the same logs
  // aren't billed twice.
  logFrom: text("log_from"),
  logTo: text("log_to"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// The master schedule of values for a project: one row per bid line item.
// `baselineQty` captures progress that predates this system (from the "I"
// / "Total Previously Installed" column on a first-time import).
export const sovItems = pgTable("sov_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  itemNo: text("item_no").notNull(),
  description: text("description"),
  unit: text("unit"), // unit of measure: Each, Linear foot, ...
  bidQty: numeric("bid_qty").notNull().default("0"),
  unitPrice: numeric("unit_price").notNull().default("0"),
  baselineQty: numeric("baseline_qty").notNull().default("0"),
  order: numeric("order").notNull().default("0"),
});

// One row per (line item x pay app period): what was billed for that item
// in that period. Cumulative "previously installed" for a given period is
// derived at read time from every earlier period's qty for the same item,
// plus the item's baselineQty.
export const sovEntries = pgTable("sov_entries", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  payAppId: text("pay_app_id").notNull(),
  itemNo: text("item_no").notNull(),
  periodQty: numeric("period_qty").notNull().default("0"),
  stored: numeric("stored").notNull().default("0"),
});

// Per-job money totals copied from the QuickBooks Projects page (read-only in
// White Board; refreshed by the Monday/Friday QuickBooks sync). Keyed by the
// QuickBooks project number, so several White Board projects that share one
// number (like the 26046 lots) all see the same job. Each company has its own
// QuickBooks file, and O&M reuses Feliciana's job numbers, so the key includes
// the company. QuickBooks projects with no number are keyed by their name.
export const qbJobs = pgTable(
  "qb_jobs",
  {
    companyId: text("company_id").notNull().default("fwi"),
    projectNumber: text("project_number").notNull(),
    name: text("name").notNull(),
    customer: text("customer"),
    status: text("status"), // QuickBooks: In progress | Completed | Canceled | Not started
    startDate: text("start_date"),
    endDate: text("end_date"),
    income: numeric("income").notNull().default("0"),
    cost: numeric("cost").notNull().default("0"),
    hours: numeric("hours"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.projectNumber] })]
);

export const opportunities = pgTable("opportunities", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  kind: text("kind").notNull().default("Opportunity"), // "Opportunity" | "Meeting"
  oppType: text("opp_type").notNull().default("Bid Job"), // Bid Job | Meeting | Hot Tap | O&M | T&M (Atmos)
  jobName: text("job_name").notNull(),
  estimator: text("estimator"),
  bidDueDate: text("bid_due_date"),
  customer: text("customer"),
  location: text("location"),
  bidValue: numeric("bid_value"),
  bidStatus: text("bid_status").notNull().default("Open"), // Open | Won | Lost | Abandoned
  convertedProjectId: text("converted_project_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- OQ practice tests (open to every signed-in user) ----------

// One practice exam (the old app linked each to a Google Form). Several task
// codes can share the same exam, hence the separate oq_exam_tasks table.
export const oqExams = pgTable("oq_exams", {
  id: text("id").primaryKey(),
  evalId: text("eval_id"),
  title: text("title").notNull(),
  formTitle: text("form_title"),
  questionCount: numeric("question_count").notNull().default("0"),
});

export const oqExamTasks = pgTable("oq_exam_tasks", {
  id: text("id").primaryKey(),
  examId: text("exam_id").notNull(),
  taskCode: text("task_code").notNull(), // e.g. "F 01"
  taskName: text("task_name").notNull(),
});

// The source quizzes did not expose their answer keys, so correctIndex is only
// filled where two independent AI passes agreed (keyStatus "ai") or an admin
// set/confirmed it ("verified"). Otherwise it is null ("unconfirmed") and the
// question is not scored; aiGuessIndex is just a hint for the admin reviewing it.
export const oqQuestions = pgTable("oq_questions", {
  id: text("id").primaryKey(),
  examId: text("exam_id").notNull(),
  position: numeric("position").notNull().default("0"),
  text: text("text").notNull(),
  options: jsonb("options").$type<string[]>().notNull().default([]),
  correctIndex: numeric("correct_index"),
  aiGuessIndex: numeric("ai_guess_index"),
  explanation: text("explanation"),
  keyStatus: text("key_status").notNull().default("unconfirmed"), // ai | verified | unconfirmed
});

// ---------- estimating (admin-only, same sensitivity as Budget) ----------

// One line item on a bid. Category replaces generic CSI codes with the
// company's actual scope of work so the builder reads like their trade.
export const bidItems = pgTable("bid_items", {
  id: text("id").primaryKey(),
  opportunityId: text("opportunity_id").notNull(),
  itemNo: text("item_no").notNull(),
  category: text("category").notNull().default("General"),
  description: text("description"),
  qty: numeric("qty").notNull().default("0"),
  unit: text("unit"),
  unitPrice: numeric("unit_price").notNull().default("0"),
  notes: text("notes"),
  order: numeric("order").notNull().default("0"),
});

// One row per opportunity: cover-sheet contact info, the overhead/profit/
// contingency/tax markup applied to the bid-items subtotal, and the terms
// & signature block. jobType is free text for now — it's what Phase 2's
// "similar past bid" matching will key off once that's built.
export const estimateDetails = pgTable("estimate_details", {
  opportunityId: text("opportunity_id").primaryKey(),
  bidNumber: text("bid_number"),
  bidValidUntil: text("bid_valid_until"),
  jobType: text("job_type"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  overheadPercent: numeric("overhead_percent").notNull().default("10"),
  profitPercent: numeric("profit_percent").notNull().default("8"),
  contingencyPercent: numeric("contingency_percent").notNull().default("3"),
  salesTaxPercent: numeric("sales_tax_percent").notNull().default("0"),
  bondInsuranceCost: numeric("bond_insurance_cost").notNull().default("0"),
  scopeInclusions: text("scope_inclusions"),
  scopeExclusions: text("scope_exclusions"),
  paymentTerms: text("payment_terms"),
  scheduleDuration: text("schedule_duration"),
  warranty: text("warranty"),
  additionalNotes: text("additional_notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Uploaded plan/spec PDFs, stored in Neon Object Storage (private bucket
// "bid-documents"). `storageKey` is the S3 object key; the file itself
// never touches Postgres.
export const planFiles = pgTable("plan_files", {
  id: text("id").primaryKey(),
  opportunityId: text("opportunity_id").notNull(),
  filename: text("filename").notNull(),
  storageKey: text("storage_key").notNull(),
  fileSize: numeric("file_size").notNull().default("0"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// Documents kept with a project: the original bid, the contract, change orders. Same private bucket as plan_files.
export const projectFiles = pgTable("project_files", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull().default("Contract"), // Original bid | Contract | Change order | Other
  filename: text("filename").notNull(),
  storageKey: text("storage_key").notNull(),
  fileSize: numeric("file_size").notNull().default("0"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// The QuickBooks quote (estimate) a small job is billed from, kept with the project the way a contract is for a big
// one. `lines` is the scope as quoted; the PDF itself is a project_files row (`fileId`). The invoice itself is made in
// QuickBooks; `billed*` records which invoice it became.
export const projectQuotes = pgTable("project_quotes", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  number: text("number").notNull(), // QuickBooks estimate number
  quoteDate: text("quote_date"),
  customer: text("customer"),
  total: numeric("total").notNull().default("0"),
  status: text("status").notNull().default("Pending"), // as shown in QuickBooks
  expires: text("expires"),
  qbLink: text("qb_link"), // opens the estimate in QuickBooks, where "Create invoice" is one click
  lines: jsonb("lines").$type<{ description: string; qty: number; amount: number }[]>().notNull().default([]),
  fileId: text("file_id"), // project_files.id of the quote PDF
  billedInvoiceNo: text("billed_invoice_no"),
  billedDate: text("billed_date"),
  billedAmount: numeric("billed_amount"),
  billedBy: text("billed_by"),
  qbInvoiceId: text("qb_invoice_id"), // set when White Board created the invoice in QuickBooks from this quote
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// The QuickBooks Online connection for a company (one QuickBooks file per company), made once from the app by an admin
// ("Connect QuickBooks"). Tokens are stored encrypted (lib/quickbooks.ts) and refreshed as they are used.
export const qbConnections = pgTable("qb_connections", {
  companyId: text("company_id").primaryKey(),
  realmId: text("realm_id").notNull(),
  companyName: text("company_name"),
  accessToken: text("access_token").notNull(), // encrypted
  refreshToken: text("refresh_token").notNull(), // encrypted
  accessExpiresAt: timestamp("access_expires_at").notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at").notNull(),
  connectedBy: text("connected_by"),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
});

// QuickBooks invoices, copied by the twice-weekly QuickBooks check so a job can list what was billed. Read-only
// here: QuickBooks is where invoices are made. `projectNumber` is the job number when the invoice is billed to a
// QuickBooks job ("26100 - Luling 8\" Ph 1"); other invoices are tied to a job through a quote's recorded invoice.
export const qbInvoices = pgTable(
  "qb_invoices",
  {
    companyId: text("company_id").notNull(),
    invoiceNo: text("invoice_no").notNull(),
    projectNumber: text("project_number"),
    customer: text("customer"),
    txnDate: text("txn_date"),
    amount: numeric("amount").notNull().default("0"),
    balance: numeric("balance").notNull().default("0"),
    memo: text("memo"),
    link: text("link"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.invoiceNo] })]
);

// O&M field report: one per job a crew does, with only the sections that kind of job needs (see lib/om-report.ts).
// `data` holds the answers by field key; photos are private-bucket keys with a caption.
export const omReports = pgTable("om_reports", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  date: text("date").notNull(),
  jobType: text("job_type").notNull(), // leak | service | meter | riser | other
  extras: jsonb("extras").$type<string[]>().default([]), // sections added beyond the job type's own
  data: jsonb("data").$type<Record<string, string | string[] | Record<string, string>[]>>().default({}),
  photos: jsonb("photos").$type<{ key: string; caption: string }[]>().default([]),
  technician: text("technician"),
  signature: text("signature"), // PNG data URL drawn on the phone
  submittedBy: text("submitted_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  editedAt: timestamp("edited_at"),
  editedBy: text("edited_by"),
});

// One AI review run over the currently-uploaded plan/spec PDFs. Frozen at
// generation time like everything else here -- re-running creates a new row
// rather than overwriting, so a history of reviews survives plan revisions.
export const planReviews = pgTable("plan_reviews", {
  id: text("id").primaryKey(),
  opportunityId: text("opportunity_id").notNull(),
  summary: text("summary"),
  findings: jsonb("findings")
    .$type<{ severity: "high" | "medium" | "low"; category: string; title: string; description: string; suggestedBidCategory: string | null }[]>()
    .default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- HR (admins and HR users only; one combined list across companies) ----------

export const hrEmployees = pgTable("hr_employees", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  position: text("position"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  personalEmail: text("personal_email"),
  hireDate: text("hire_date"),
  status: text("status").notNull().default("active"), // active | leave | terminated
  terminatedDate: text("terminated_date"),
  // Enrollment in the drug & alcohol testing (random pool) program.
  daProgram: text("da_program").notNull().default("pending"), // pending | active | inactive
  daEnrolledDate: text("da_enrolled_date"),
  notes: text("notes"),
  candidateId: text("candidate_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hrCandidates = pgTable("hr_candidates", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  position: text("position"),
  address: text("address"),
  source: text("source"),
  stage: text("stage").notNull().default("applied"),
  appliedDate: text("applied_date"),
  notes: text("notes"),
  employeeId: text("employee_id"), // set once hired
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// One row per test, for a candidate (pre-employment) or an employee. Status and
// dates only; the result document, if any, lives in object storage.
export const hrDrugTests = pgTable("hr_drug_tests", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id"),
  employeeId: text("employee_id"),
  testType: text("test_type").notNull().default("pre_employment"),
  substance: text("substance").notNull().default("both"), // drug | alcohol | both
  orderedDate: text("ordered_date"),
  collectedDate: text("collected_date"),
  resultDate: text("result_date"),
  facility: text("facility"),
  status: text("status").notNull().default("ordered"),
  notes: text("notes"),
  storageKey: text("storage_key"),
  filename: text("filename"),
  contentType: text("content_type"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// An employee's OQ qualification for one task code (codes come from the OQ practice tests).
export const hrOqQuals = pgTable("hr_oq_quals", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id").notNull(),
  taskCode: text("task_code").notNull(),
  taskName: text("task_name").notNull(),
  qualifiedDate: text("qualified_date").notNull(),
  expiresDate: text("expires_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- OQ practice invite links ----------

// A personal link that opens only the OQ practice tests, with no account or
// password. The token in the URL is the credential: long, random, and valid
// until someone revokes it (there is deliberately no expiration).
export const oqInvites = pgTable("oq_invites", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  companyId: text("company_id").notNull(),
  employeeId: text("employee_id"),
  // A shared link for a whole class: one link for many people, no personal greeting.
  isGroup: boolean("is_group").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
  lastUsedAt: timestamp("last_used_at"),
  useCount: integer("use_count").notNull().default(0),
  sentAt: timestamp("sent_at"),
});
