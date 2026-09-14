CREATE TABLE IF NOT EXISTS milestones (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  name text NOT NULL,
  date text,
  done boolean NOT NULL DEFAULT false,
  "order" numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  date text NOT NULL,
  leak_number text NOT NULL DEFAULT 'N/A',
  foreman text,
  line_item text,
  crew jsonb DEFAULT '[]',
  description text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_items (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  item_no text NOT NULL,
  description text,
  "order" numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  date text,
  description text,
  amount numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  invoice_number text,
  vendor text,
  date text,
  amount numeric NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT 'Other'
);

CREATE TABLE IF NOT EXISTS pay_apps (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  app_number text NOT NULL,
  period text,
  application_date text,
  retainage_percent numeric NOT NULL DEFAULT 5,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sov_items (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  item_no text NOT NULL,
  description text,
  bid_qty numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  baseline_qty numeric NOT NULL DEFAULT 0,
  "order" numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sov_entries (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  pay_app_id text NOT NULL,
  item_no text NOT NULL,
  period_qty numeric NOT NULL DEFAULT 0,
  stored numeric NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones (project_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_project ON daily_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_line_items_project ON line_items (project_id);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON expenses (project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices (project_id);
CREATE INDEX IF NOT EXISTS idx_pay_apps_project ON pay_apps (project_id);
CREATE INDEX IF NOT EXISTS idx_sov_items_project ON sov_items (project_id);
CREATE INDEX IF NOT EXISTS idx_sov_entries_project ON sov_entries (project_id);
CREATE INDEX IF NOT EXISTS idx_sov_entries_payapp ON sov_entries (pay_app_id);
