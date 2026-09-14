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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const crew = pgTable("crew", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
