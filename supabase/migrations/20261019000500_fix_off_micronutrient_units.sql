-- DATA REPAIR (review before merging: the migrate workflow runs this on prod).
--
-- Bug: Open Food Facts reports every `*_100g` micronutrient in GRAMS, but the importer copied the
-- numbers unconverted into keys whose suffix says mg / ug. So an ingredient imported from OFF has
-- iron_mg = 0.012 where it should be 12, and vitamin_d_ug = 0.0000034 where it should be 3.4.
-- The importer is fixed in lib/nutrition/open-food-facts.ts (same PR); this repairs rows already saved.
--
-- Scope: ONLY ingredients.api_source = 'openfoodfacts', and ONLY the 13 keys the OFF importer writes.
--   *_mg keys x 1000   (iron, calcium, potassium, magnesium, zinc, vitamin_c, vitamin_e, phosphorus)
--   *_ug keys x 1e6    (vitamin_a, vitamin_d, vitamin_k, selenium, folate)
-- Other keys (e.g. vitamin_b12_ug from USDA, whose values are already in mg/ug) are untouched.
--
-- Reversible: the old micronutrients are copied to micronutrients_backup_20261019 first. To undo:
--   UPDATE ingredients i SET micronutrients = b.micronutrients
--   FROM micronutrients_backup_20261019 b WHERE b.ingredient_id = i.id;
-- Not applied twice: a row is converted only in the statement that inserts it into the backup table
-- (ON CONFLICT DO NOTHING), so re-running never converts the same ingredient again.
--
-- Residual risk: a row marked 'openfoodfacts' whose micros an admin later retyped by hand in correct
-- units would be inflated. Those rows can be restored from the backup table.

CREATE TABLE IF NOT EXISTS micronutrients_backup_20261019 (
  ingredient_id UUID PRIMARY KEY REFERENCES ingredients(id) ON DELETE CASCADE,
  micronutrients JSONB NOT NULL,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE micronutrients_backup_20261019 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON micronutrients_backup_20261019
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

WITH converted AS (
  INSERT INTO micronutrients_backup_20261019 (ingredient_id, micronutrients)
  SELECT id, micronutrients
  FROM ingredients
  WHERE api_source = 'openfoodfacts'
    AND micronutrients ?| ARRAY[
      'iron_mg', 'calcium_mg', 'potassium_mg', 'magnesium_mg', 'zinc_mg', 'vitamin_c_mg',
      'vitamin_e_mg', 'phosphorus_mg', 'vitamin_a_ug', 'vitamin_d_ug', 'vitamin_k_ug',
      'selenium_ug', 'folate_ug'
    ]
  ON CONFLICT (ingredient_id) DO NOTHING
  RETURNING ingredient_id
)
UPDATE ingredients i
SET micronutrients = (
  SELECT COALESCE(jsonb_object_agg(
    e.key,
    CASE
      WHEN jsonb_typeof(e.value) <> 'number' THEN e.value
      WHEN e.key IN ('iron_mg', 'calcium_mg', 'potassium_mg', 'magnesium_mg', 'zinc_mg',
                     'vitamin_c_mg', 'vitamin_e_mg', 'phosphorus_mg')
        THEN to_jsonb(round((e.value #>> '{}')::numeric * 1000, 6))
      WHEN e.key IN ('vitamin_a_ug', 'vitamin_d_ug', 'vitamin_k_ug', 'selenium_ug', 'folate_ug')
        THEN to_jsonb(round((e.value #>> '{}')::numeric * 1000000, 6))
      ELSE e.value
    END
  ), '{}'::jsonb)
  FROM jsonb_each(i.micronutrients) AS e
)
WHERE i.id IN (SELECT ingredient_id FROM converted);
