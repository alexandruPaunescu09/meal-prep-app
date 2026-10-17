-- Optional brand name for an ingredient (e.g. "Pilos", "Lidl Milbona").
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS brand TEXT;
