-- RI-0a: gram weight for pieces. Unit 'buc' had no weight, so nutrition math
-- counted "2 eggs" as 2 g. NULL keeps the old behaviour.
ALTER TABLE ingredients
  ADD COLUMN piece_weight_g NUMERIC NULL CHECK (piece_weight_g > 0);

COMMENT ON COLUMN ingredients.piece_weight_g IS
  'Grams per 1 buc. Only meaningful when unit = ''buc''. Assumes nutrition is per 100 g.';

-- Same definition as 20261019000010_hide_prices_from_customers.sql (owner view, same
-- WHERE and grants) with piece_weight_g appended. Never add price or notes columns.
CREATE OR REPLACE VIEW ingredients_public AS
SELECT
  id, name, brand, category, unit,
  calories, protein, carbs, fat, fiber, sugar, sat_fat, salt,
  micronutrients, barcode,
  piece_weight_g
FROM ingredients
WHERE is_admin() OR current_client_id() IS NOT NULL;
