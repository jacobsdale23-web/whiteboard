ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_type text NOT NULL DEFAULT 'lump_sum';

UPDATE projects SET billing_type = 'tm'
WHERE id IN ('atmos-jackson', 'atmos-nola-remi', 'atmos-nola-dustin', 'atmos-monroe');
