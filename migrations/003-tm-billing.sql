ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS task_number text;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS locusview_number text;

CREATE TABLE IF NOT EXISTS billing_rates (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  position text NOT NULL,
  hourly_rate numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS billing_tasks (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  task_number text NOT NULL,
  project_name text,
  task_request_no text,
  contract_coordinator text,
  bill_to_name text,
  bill_to_address text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tm_invoices (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  billing_task_id text NOT NULL,
  invoice_number text,
  period_start text NOT NULL,
  period_end text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total numeric NOT NULL DEFAULT 0,
  line_items jsonb DEFAULT '[]',
  created_at timestamp NOT NULL DEFAULT now(),
  approved_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_daily_logs_task ON daily_logs (project_id, task_number);
CREATE INDEX IF NOT EXISTS idx_billing_rates_project ON billing_rates (project_id);
CREATE INDEX IF NOT EXISTS idx_billing_tasks_project ON billing_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tm_invoices_project ON tm_invoices (project_id);
CREATE INDEX IF NOT EXISTS idx_tm_invoices_task ON tm_invoices (billing_task_id);
