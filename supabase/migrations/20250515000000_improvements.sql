-- Add new ingredient categories
ALTER TYPE ingredient_category ADD VALUE IF NOT EXISTS 'legumes';
ALTER TYPE ingredient_category ADD VALUE IF NOT EXISTS 'bread_pasta';
ALTER TYPE ingredient_category ADD VALUE IF NOT EXISTS 'dessert_sweets';

-- Add final weight to recipes for easier portioning
ALTER TABLE recipes ADD COLUMN final_weight NUMERIC;

-- Support fractional portions
ALTER TABLE meal_plan_entries ALTER COLUMN portions TYPE NUMERIC USING portions::NUMERIC;

-- Support direct ingredient entries (alternative to recipe)
ALTER TABLE meal_plan_entries ALTER COLUMN recipe_id DROP NOT NULL;
ALTER TABLE meal_plan_entries ADD COLUMN ingredient_id UUID REFERENCES ingredients(id) ON DELETE RESTRICT;
ALTER TABLE meal_plan_entries ADD COLUMN quantity NUMERIC;

-- Ensure either recipe_id or ingredient_id is set
ALTER TABLE meal_plan_entries ADD CONSTRAINT entry_has_recipe_or_ingredient
  CHECK (recipe_id IS NOT NULL OR ingredient_id IS NOT NULL);
