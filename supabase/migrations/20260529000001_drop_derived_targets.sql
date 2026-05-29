-- Carbs and fiber targets are derived, not stored:
--   carbs_target_g = (calorie_target - protein_g*4 - fat_g*9) / 4
--   fiber_target = 10..14g per 1000 kcal (range)
-- Drop the redundant per-kg columns added in 20260529000000.

ALTER TABLE meal_plans DROP COLUMN IF EXISTS carbs_per_kg;
ALTER TABLE meal_plans DROP COLUMN IF EXISTS fiber_per_kg;
