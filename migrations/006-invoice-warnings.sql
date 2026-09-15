ALTER TABLE tm_invoices ADD COLUMN IF NOT EXISTS warnings jsonb DEFAULT '[]';
