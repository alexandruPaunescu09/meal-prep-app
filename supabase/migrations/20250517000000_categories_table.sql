-- Create categories table (replaces ingredient_category ENUM)
CREATE TABLE ingredient_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with existing enum values
INSERT INTO ingredient_categories (slug, name, sort_order) VALUES
  ('protein', 'Protein', 1),
  ('dairy', 'Dairy', 2),
  ('grains', 'Grains', 3),
  ('fruits', 'Fruits', 4),
  ('vegetables', 'Vegetables', 5),
  ('fats', 'Fats & Oils', 6),
  ('nuts_seeds', 'Nuts & Seeds', 7),
  ('supplements', 'Supplements', 8),
  ('bakery', 'Bakery', 9),
  ('legumes', 'Legumes', 10),
  ('bread_pasta', 'Bread & Pasta', 11),
  ('dessert_sweets', 'Dessert & Sweets', 12),
  ('other', 'Other', 99);

-- Convert ingredients.category from ENUM to TEXT
ALTER TABLE ingredients ALTER COLUMN category TYPE TEXT USING category::TEXT;
ALTER TABLE ingredients ALTER COLUMN category SET DEFAULT 'other';

-- Drop the old enum type
DROP TYPE ingredient_category;

-- RLS
ALTER TABLE ingredient_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON ingredient_categories
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Index for display ordering
CREATE INDEX idx_ingredient_categories_sort ON ingredient_categories(sort_order);
