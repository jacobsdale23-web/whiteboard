CREATE TABLE IF NOT EXISTS jsa_forms (
  id text PRIMARY KEY,
  project_id text NOT NULL,
  date text NOT NULL,
  foreman text,
  weather text,
  task_types jsonb DEFAULT '[]',
  hazards jsonb DEFAULT '[]',
  ppe jsonb DEFAULT '[]',
  additional_hazards text,
  emergency_info text,
  crew jsonb DEFAULT '[]',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jsa_forms_project ON jsa_forms (project_id);
