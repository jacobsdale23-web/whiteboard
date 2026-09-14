-- Run this once in Neon's SQL Editor (Neon Console -> your project -> SQL Editor)
-- to create the tables and load a few starter rows so the board isn't empty
-- the first time you sign in.

CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'member',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  location text,
  status text NOT NULL DEFAULT 'upcoming',
  start_date text,
  end_date text,
  duration text,
  value numeric,
  crew jsonb DEFAULT '[]',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crew (
  id text PRIMARY KEY,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

INSERT INTO crew (id, name) VALUES
  ('jonathon', 'Jonathon'),
  ('zack', 'Zack'),
  ('dylan', 'Dylan'),
  ('cade', 'Cade'),
  ('ben', 'Ben')
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, location, status, end_date, value, crew) VALUES
  ('donaldsville-phase3', 'Phase 3', 'Donaldsville, LA', 'active', '2026-09-30', NULL, '["Jonathon"]'),
  ('livingston-gas-main', 'Gas Main Relocation', 'Livingston, LA', 'active', '2026-10-31', 580000, '["Ben"]'),
  ('upcoming-la70', 'LA 70 Rehab', NULL, 'upcoming', NULL, 905558, '[]')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS opportunities (
  id text PRIMARY KEY,
  kind text NOT NULL DEFAULT 'Opportunity',
  opp_type text NOT NULL DEFAULT 'Bid Job',
  job_name text NOT NULL,
  estimator text,
  bid_due_date text,
  customer text,
  location text,
  bid_value numeric,
  bid_status text NOT NULL DEFAULT 'Open',
  converted_project_id text,
  created_at timestamp NOT NULL DEFAULT now()
);
