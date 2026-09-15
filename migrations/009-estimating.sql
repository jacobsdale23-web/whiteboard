CREATE TABLE IF NOT EXISTS bid_items (
  id text PRIMARY KEY,
  opportunity_id text NOT NULL,
  item_no text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  description text,
  qty numeric NOT NULL DEFAULT 0,
  unit text,
  unit_price numeric NOT NULL DEFAULT 0,
  notes text,
  "order" numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS estimate_details (
  opportunity_id text PRIMARY KEY,
  bid_number text,
  bid_valid_until text,
  job_type text,
  contact_name text,
  contact_phone text,
  contact_email text,
  overhead_percent numeric NOT NULL DEFAULT 10,
  profit_percent numeric NOT NULL DEFAULT 8,
  contingency_percent numeric NOT NULL DEFAULT 3,
  sales_tax_percent numeric NOT NULL DEFAULT 0,
  bond_insurance_cost numeric NOT NULL DEFAULT 0,
  scope_inclusions text,
  scope_exclusions text,
  payment_terms text,
  schedule_duration text,
  warranty text,
  additional_notes text,
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bid_items_opportunity ON bid_items (opportunity_id);
