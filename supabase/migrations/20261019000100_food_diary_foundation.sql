-- Customer food diary foundation (epic FD, story FD-1).
--   foods            shared consumer-product catalog (no prices); customers read, never write
--   food_log_entries the diary: one row per thing a customer ate outside/inside the plan,
--                    with a nutrition SNAPSHOT so history survives catalog edits/deletions

-- ---------------------------------------------------------------------------
-- foods
-- ---------------------------------------------------------------------------
CREATE TABLE foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  brand TEXT,
  unit TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g', 'ml')),
  -- Per 100 g / 100 ml (same columns as ingredients)
  calories NUMERIC,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  fiber NUMERIC,
  sugar NUMERIC,
  sat_fat NUMERIC,
  salt NUMERIC,
  micronutrients JSONB NOT NULL DEFAULT '{}'::jsonb,
  serving_size NUMERIC CHECK (serving_size IS NULL OR serving_size > 0),
  serving_label TEXT,
  package_size NUMERIC,
  source TEXT NOT NULL CHECK (source IN ('off', 'label_photo', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'hidden')),
  created_by_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  promoted_ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_foods_name_lower ON foods (lower(name));
CREATE INDEX idx_foods_status ON foods (status);
CREATE INDEX idx_foods_creator ON foods (created_by_client_id, created_at DESC);

CREATE TRIGGER foods_updated_at
  BEFORE UPDATE ON foods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON foods
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Customers read active foods and their own pending ones. No customer writes:
-- inserts go through /api/portal/foods/* with the service client after validation.
CREATE POLICY "Customer read" ON foods
  FOR SELECT USING (
    status = 'active'
    OR (status = 'pending' AND created_by_client_id = current_client_id())
  );

-- ---------------------------------------------------------------------------
-- food_log_entries
-- ---------------------------------------------------------------------------
CREATE TABLE food_log_entries (
  -- Generated on the client so offline replays upsert idempotently.
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- The customer's LOCAL calendar date (never derive from UTC).
  log_date DATE NOT NULL,
  meal_type meal_type NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('food', 'ingredient', 'recipe', 'quick')),
  -- SET NULL: admin deletions never break history; the snapshot keeps the numbers.
  food_id UUID REFERENCES foods(id) ON DELETE SET NULL,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  quantity_unit TEXT NOT NULL CHECK (quantity_unit IN ('g', 'ml', 'serving', 'portion')),
  -- Snapshot: totals for THIS entry (not per 100), computed server-side at log time.
  name TEXT NOT NULL,
  brand TEXT,
  calories NUMERIC,
  protein NUMERIC,
  carbs NUMERIC,
  fat NUMERIC,
  fiber NUMERIC,
  sugar NUMERIC,
  sat_fat NUMERIC,
  salt NUMERIC,
  micronutrients JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT food_log_entries_one_source CHECK (
    num_nonnulls(food_id, ingredient_id, recipe_id) <= 1
    AND (source_kind <> 'quick' OR num_nonnulls(food_id, ingredient_id, recipe_id) = 0)
  )
);

CREATE INDEX idx_food_log_entries_client_date ON food_log_entries (client_id, log_date);

CREATE TRIGGER food_log_entries_updated_at
  BEFORE UPDATE ON food_log_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE food_log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read" ON food_log_entries
  FOR SELECT USING (is_admin());

CREATE POLICY "Customer manage own" ON food_log_entries
  FOR ALL USING (client_id = current_client_id())
  WITH CHECK (client_id = current_client_id());
