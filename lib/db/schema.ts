import { pgTable, text, timestamp, numeric, jsonb, boolean } from "drizzle-orm/pg-core";

// One row per Neon Auth user, created on first sign-in. `role` is what
// gates admin-only pages/actions on the server — never trust a client claim.
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(), // Neon Auth user id
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("member"), // "admin" | "member"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location"),
  status: text("status").notNull().default("upcoming"), // "active" | "upcoming" | "complete"
  startDate: text("start_date"),
  endDate: text("end_date"),
  duration: text("duration"),
  value: numeric("value"),
  crew: jsonb("crew").$type<string[]>().default([]),
  billingType: text("billing_type").notNull().default("lump_sum"), // "lump_sum" | "tm" — gates the T&M Billing section
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const crew = pgTable("crew", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  role: text("role").notNull().default("foreman"), // "foreman" | "worker" — only foremen show up at the Shop
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
