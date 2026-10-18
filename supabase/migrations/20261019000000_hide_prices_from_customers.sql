-- FD-0: stop exposing ingredient prices and admin recipe notes to customers.
--
-- Admin and customers share the Postgres `authenticated` role, so column-level
-- GRANTs cannot separate them. The customer SELECT policies on the base tables
-- let a portal user read package_price / price_per_unit / quantity_purchased
-- (ingredients) and notes (recipes) straight through PostgREST. Fix: drop those
-- policies and give customers column-restricted views instead.
--
-- recipe_ingredients keeps its "Customer read" policy: it only holds
-- (id, recipe_id, ingredient_id, quantity), nothing confidential.

DROP POLICY IF EXISTS "Customer read" ON ingredients;
DROP POLICY IF EXISTS "Customer read" ON recipes;

-- NOTE: these are deliberately plain (security-definer / owner) views, NOT
-- security_invoker. The base tables no longer allow customer SELECT, so an
-- invoker view would return nothing for customers. Supabase's advisor flags
-- security-definer views; the mitigation is the explicit WHERE clause, which
-- only returns rows to admins and linked customers (never anon), plus the
-- column lists below that omit every confidential column. Do not add price or
-- notes columns to these views.

CREATE OR REPLACE VIEW ingredients_public AS
SELECT
  id, name, brand, category, unit,
  calories, protein, carbs, fat, fiber, sugar, sat_fat, salt,
  micronutrients, barcode
FROM ingredients
WHERE is_admin() OR current_client_id() IS NOT NULL;

CREATE OR REPLACE VIEW recipes_public AS
SELECT
  id, name, portions, final_weight, customer_description,
  container_type_id, created_at, updated_at
FROM recipes
WHERE is_admin() OR current_client_id() IS NOT NULL;

REVOKE ALL ON ingredients_public FROM PUBLIC, anon;
REVOKE ALL ON recipes_public FROM PUBLIC, anon;
GRANT SELECT ON ingredients_public TO authenticated;
GRANT SELECT ON recipes_public TO authenticated;
