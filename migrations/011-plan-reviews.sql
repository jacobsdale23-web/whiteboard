CREATE TABLE IF NOT EXISTS plan_reviews (
  id text PRIMARY KEY,
  opportunity_id text NOT NULL,
  summary text,
  findings jsonb DEFAULT '[]',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_reviews_opportunity ON plan_reviews (opportunity_id);
