-- Replace the blanket "auth.uid() IS NOT NULL" policies with role-aware ones.
-- Admin: full access to everything (current behavior).
-- Customer: read-only access to ingredients/recipes (needed to render plans);
-- restricted access to clients/meal_plans/meal_plan_entries scoped to their
-- own client_id.

-- INGREDIENTS: admin full, customer read.
DROP POLICY IF EXISTS "Authenticated full access" ON ingredients;
CREATE POLICY "Admin full access" ON ingredients
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Customer read" ON ingredients
  FOR SELECT USING (current_client_id() IS NOT NULL);

-- INGREDIENT_CATEGORIES: admin full, customer read.
DROP POLICY IF EXISTS "Authenticated full access" ON ingredient_categories;
CREATE POLICY "Admin full access" ON ingredient_categories
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Customer read" ON ingredient_categories
  FOR SELECT USING (current_client_id() IS NOT NULL);

-- INGREDIENT_PRICE_HISTORY: admin only (prices are confidential).
DROP POLICY IF EXISTS "Authenticated full access" ON ingredient_price_history;
CREATE POLICY "Admin full access" ON ingredient_price_history
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- RECIPES: admin full, customer read.
DROP POLICY IF EXISTS "Authenticated full access" ON recipes;
CREATE POLICY "Admin full access" ON recipes
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Customer read" ON recipes
  FOR SELECT USING (current_client_id() IS NOT NULL);

-- RECIPE_INGREDIENTS: admin full, customer read.
DROP POLICY IF EXISTS "Authenticated full access" ON recipe_ingredients;
CREATE POLICY "Admin full access" ON recipe_ingredients
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Customer read" ON recipe_ingredients
  FOR SELECT USING (current_client_id() IS NOT NULL);

-- CLIENTS: admin full, customer reads only their own row.
DROP POLICY IF EXISTS "Authenticated full access" ON clients;
CREATE POLICY "Admin full access" ON clients
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Customer read own" ON clients
  FOR SELECT USING (id = current_client_id());

-- MEAL_PLANS: admin full, customer reads only plans for their own client.
DROP POLICY IF EXISTS "Authenticated full access" ON meal_plans;
CREATE POLICY "Admin full access" ON meal_plans
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Customer read own" ON meal_plans
  FOR SELECT USING (client_id = current_client_id());

-- MEAL_PLAN_ENTRIES: admin full, customer reads only entries belonging to
-- their own meal plans.
DROP POLICY IF EXISTS "Authenticated full access" ON meal_plan_entries;
CREATE POLICY "Admin full access" ON meal_plan_entries
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Customer read own" ON meal_plan_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM meal_plans mp
      WHERE mp.id = meal_plan_entries.meal_plan_id
        AND mp.client_id = current_client_id()
    )
  );

-- CONTAINER_TYPES: admin full, customer read (needed only if portal renders
-- container info; safe to allow read).
DROP POLICY IF EXISTS "Authenticated full access" ON container_types;
CREATE POLICY "Admin full access" ON container_types
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Customer read" ON container_types
  FOR SELECT USING (current_client_id() IS NOT NULL);

-- CONTAINER_DELIVERIES, CONTAINER_DELIVERY_ITEMS: admin only.
DROP POLICY IF EXISTS "Authenticated full access" ON container_deliveries;
CREATE POLICY "Admin full access" ON container_deliveries
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Authenticated full access" ON container_delivery_items;
CREATE POLICY "Admin full access" ON container_delivery_items
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- PREP tables: admin only.
DROP POLICY IF EXISTS "Authenticated full access" ON prep_rules;
CREATE POLICY "Admin full access" ON prep_rules
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Authenticated full access" ON prep_tasks;
CREATE POLICY "Admin full access" ON prep_tasks
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- SHOPPING/COOKING check states: admin only.
-- Note: these used a slightly different policy name ("auth full access").
DROP POLICY IF EXISTS "auth full access" ON shopping_check_state;
DROP POLICY IF EXISTS "Authenticated full access" ON shopping_check_state;
CREATE POLICY "Admin full access" ON shopping_check_state
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "auth full access" ON cooking_check_state;
DROP POLICY IF EXISTS "Authenticated full access" ON cooking_check_state;
CREATE POLICY "Admin full access" ON cooking_check_state
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
