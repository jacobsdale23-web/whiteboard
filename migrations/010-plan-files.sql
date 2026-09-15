CREATE TABLE IF NOT EXISTS plan_files (
  id text PRIMARY KEY,
  opportunity_id text NOT NULL,
  filename text NOT NULL,
  storage_key text NOT NULL,
  file_size numeric NOT NULL DEFAULT 0,
  uploaded_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_files_opportunity ON plan_files (opportunity_id);
