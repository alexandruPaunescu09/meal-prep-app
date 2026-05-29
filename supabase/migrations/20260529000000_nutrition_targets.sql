-- Per-meal-plan nutrition targets, computed from client body weight (kg).
-- Targets stored as ratios per kg on meal_plans (resolved at render time
-- against clients.weight_kg). Calorie target stored as absolute kcal/day.

ALTER TABLE clients ADD COLUMN weight_kg NUMERIC;

ALTER TABLE meal_plans
  ADD COLUMN calorie_target INT,
  ADD COLUMN protein_per_kg NUMERIC,
  ADD COLUMN carbs_per_kg NUMERIC,
  ADD COLUMN fat_per_kg NUMERIC,
  ADD COLUMN fiber_per_kg NUMERIC;
