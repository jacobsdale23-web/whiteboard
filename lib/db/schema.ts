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
  status: text("status").notNull().default("upcoming"), // "active" | "upcoming" | "complete"
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
    .$type<{ severity: "error" | "warning"; type: string; message: string; date: string; crewMember: string }[]>()
    .default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedAt: timestamp("approved_at"),
});

// Public, price-free copy of each schedule-of-values line item, so field
// crew can pick a line item on a daily log without needing Budget access.
export const lineItems = pgTable("line_items", {
  id: text("id").primaryKey(), // `${projectId}-${itemNo}` slug
  projectId: text("project_id").notNull(),
  itemNo: text("item_no").notNull(),
  description: text("description"),
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
