-- Atomic RPCs replacing multi-step client-side writes (UX review 2026-10-17, section 1 item 3),
-- plus a customer DELETE policy on their own meal reviews.
-- All admin functions: SECURITY INVOKER (RLS still applies), is_admin() guard,
-- EXECUTE revoked from PUBLIC and granted to authenticated (house pattern: apply_invoice_prices).

-- ---------------------------------------------------------------------------
-- save_recipe: create (p_recipe_id NULL) or update a recipe and replace its
-- ingredient lines in ONE transaction.
-- p_recipe:      {name, portions, final_weight, notes, customer_description, container_type_id}
-- p_ingredients: [{ingredient_id, quantity}]  (non-empty, quantity > 0)
-- Returns the recipe id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION save_recipe(p_recipe_id uuid, p_recipe jsonb, p_ingredients jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_name TEXT;
  v_portions INT;
  v_line jsonb;
  v_ing_id UUID;
  v_qty NUMERIC;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_recipe IS NULL OR jsonb_typeof(p_recipe) <> 'object' THEN
    RAISE EXCEPTION 'p_recipe must be a JSON object';
  END IF;
  IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array'
     OR jsonb_array_length(p_ingredients) = 0 THEN
    RAISE EXCEPTION 'a recipe needs at least one ingredient';
  END IF;

  v_name := btrim(COALESCE(p_recipe->>'name', ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'recipe name is required';
  END IF;
  v_portions := COALESCE(NULLIF(p_recipe->>'portions', '')::int, 1);
  IF v_portions < 1 THEN
    RAISE EXCEPTION 'portions must be at least 1';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_ingredients)
  LOOP
    v_ing_id := NULLIF(v_line->>'ingredient_id', '')::uuid;
    v_qty := NULLIF(v_line->>'quantity', '')::numeric;
    IF v_ing_id IS NULL THEN
      RAISE EXCEPTION 'ingredient line is missing ingredient_id';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'quantity must be greater than 0 (ingredient %)', v_ing_id;
    END IF;
  END LOOP;

  IF p_recipe_id IS NULL THEN
    INSERT INTO recipes (name, portions, final_weight, notes, customer_description, container_type_id)
    VALUES (
      v_name,
      v_portions,
      NULLIF(p_recipe->>'final_weight', '')::numeric,
      NULLIF(p_recipe->>'notes', ''),
      NULLIF(p_recipe->>'customer_description', ''),
      NULLIF(p_recipe->>'container_type_id', '')::uuid
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE recipes
    SET name = v_name,
        portions = v_portions,
        final_weight = NULLIF(p_recipe->>'final_weight', '')::numeric,
        notes = NULLIF(p_recipe->>'notes', ''),
        customer_description = NULLIF(p_recipe->>'customer_description', ''),
        container_type_id = NULLIF(p_recipe->>'container_type_id', '')::uuid
    WHERE id = p_recipe_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'recipe % not found', p_recipe_id;
    END IF;
    DELETE FROM recipe_ingredients WHERE recipe_id = v_id;
  END IF;

  INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity)
  SELECT v_id, (l->>'ingredient_id')::uuid, (l->>'quantity')::numeric
  FROM jsonb_array_elements(p_ingredients) AS l;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION save_recipe(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_recipe(uuid, jsonb, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- duplicate_meal_plan: copy a plan (nutrition targets + all entries) under a new
-- name/client/week/markup. Customer data (statuses, reviews) is not copied.
-- Returns the new plan id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION duplicate_meal_plan(
  p_source_id uuid,
  p_name text,
  p_client_id uuid,
  p_week_start date,
  p_markup_multiplier numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'plan name is required';
  END IF;
  IF p_week_start IS NULL THEN
    RAISE EXCEPTION 'week_start is required';
  END IF;
  IF p_markup_multiplier IS NOT NULL AND p_markup_multiplier <= 0 THEN
    RAISE EXCEPTION 'markup_multiplier must be greater than 0';
  END IF;

  INSERT INTO meal_plans
    (name, client_id, week_start, markup_multiplier, calorie_target, protein_per_kg, fat_per_kg)
  SELECT btrim(p_name), p_client_id, p_week_start,
         COALESCE(p_markup_multiplier, mp.markup_multiplier),
         mp.calorie_target, mp.protein_per_kg, mp.fat_per_kg
  FROM meal_plans mp
  WHERE mp.id = p_source_id
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'meal plan % not found', p_source_id;
  END IF;

  INSERT INTO meal_plan_entries
    (meal_plan_id, day_of_week, meal_type, recipe_id, ingredient_id, quantity, portions)
  SELECT v_new_id, e.day_of_week, e.meal_type, e.recipe_id, e.ingredient_id, e.quantity, e.portions
  FROM meal_plan_entries e
  WHERE e.meal_plan_id = p_source_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION duplicate_meal_plan(uuid, text, uuid, date, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION duplicate_meal_plan(uuid, text, uuid, date, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- clone_week: duplicate every plan of p_source_week into p_target_week, skipping
-- plans whose client already has a plan in the target week (null-client plans are
-- always cloned). Atomic. Returns {"created": [uuid...], "skipped": int}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION clone_week(p_source_week date, p_target_week date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_plan meal_plans%ROWTYPE;
  v_created uuid[] := '{}';
  v_skipped INT := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_source_week IS NULL OR p_target_week IS NULL THEN
    RAISE EXCEPTION 'source and target weeks are required';
  END IF;
  IF p_source_week = p_target_week THEN
    RAISE EXCEPTION 'source and target week must differ';
  END IF;

  FOR v_plan IN
    SELECT * FROM meal_plans WHERE week_start = p_source_week ORDER BY created_at, id
  LOOP
    IF v_plan.client_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM meal_plans t
      WHERE t.week_start = p_target_week AND t.client_id = v_plan.client_id
    ) THEN
      v_skipped := v_skipped + 1;
    ELSE
      v_created := v_created || duplicate_meal_plan(
        v_plan.id, v_plan.name, v_plan.client_id, p_target_week, v_plan.markup_multiplier
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', to_jsonb(v_created), 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION clone_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clone_week(date, date) TO authenticated;

-- ---------------------------------------------------------------------------
-- log_container_delivery: insert a delivery and its items atomically.
-- p_items: [{container_type_id, quantity_sent, quantity_returned}]; rows with both
-- quantities 0 are skipped. Returns the delivery id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_container_delivery(
  p_client_id uuid,
  p_meal_plan_id uuid,
  p_delivery_date date,
  p_notes text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_item jsonb;
  v_type UUID;
  v_sent NUMERIC;
  v_ret NUMERIC;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'client_id is required';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be an array';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_type := NULLIF(v_item->>'container_type_id', '')::uuid;
    v_sent := COALESCE(NULLIF(v_item->>'quantity_sent', '')::numeric, 0);
    v_ret  := COALESCE(NULLIF(v_item->>'quantity_returned', '')::numeric, 0);
    IF v_type IS NULL THEN
      RAISE EXCEPTION 'item is missing container_type_id';
    END IF;
    IF v_sent < 0 OR v_ret < 0 OR v_sent <> trunc(v_sent) OR v_ret <> trunc(v_ret) THEN
      RAISE EXCEPTION 'quantities must be non-negative integers (container type %)', v_type;
    END IF;
  END LOOP;

  INSERT INTO container_deliveries (client_id, meal_plan_id, delivery_date, notes)
  VALUES (
    p_client_id,
    p_meal_plan_id,
    COALESCE(p_delivery_date, CURRENT_DATE),
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_id;

  INSERT INTO container_delivery_items (delivery_id, container_type_id, quantity_sent, quantity_returned)
  SELECT v_id,
         (i->>'container_type_id')::uuid,
         COALESCE(NULLIF(i->>'quantity_sent', '')::numeric, 0)::int,
         COALESCE(NULLIF(i->>'quantity_returned', '')::numeric, 0)::int
  FROM jsonb_array_elements(p_items) AS i
  WHERE COALESCE(NULLIF(i->>'quantity_sent', '')::numeric, 0) <> 0
     OR COALESCE(NULLIF(i->>'quantity_returned', '')::numeric, 0) <> 0;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION log_container_delivery(uuid, uuid, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_container_delivery(uuid, uuid, date, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- regenerate_prep_tasks: replace the week's prep tasks with the freshly generated
-- drafts in one transaction, carrying over completed/completed_at from an old task
-- with the same (ingredient_id, prep_type, prep_date).
-- p_tasks: [{prep_date, cook_date, ingredient_id, prep_type, quantity, unit, recipe_names[]}]
-- Returns {"inserted": n, "preserved_completed": n, "dropped_completed": n}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION regenerate_prep_tasks(p_week_start date, p_tasks jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inserted INT;
  v_preserved INT;
  v_dropped INT;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_week_start IS NULL THEN
    RAISE EXCEPTION 'week_start is required';
  END IF;
  IF p_tasks IS NULL OR jsonb_typeof(p_tasks) <> 'array' THEN
    RAISE EXCEPTION 'p_tasks must be an array';
  END IF;

  WITH old AS (
    DELETE FROM prep_tasks WHERE week_start = p_week_start RETURNING *
  ),
  new AS (
    SELECT * FROM jsonb_to_recordset(p_tasks) AS t(
      prep_date date, cook_date date, ingredient_id uuid, prep_type text,
      quantity numeric, unit text, recipe_names jsonb
    )
  ),
  ins AS (
    INSERT INTO prep_tasks
      (week_start, prep_date, cook_date, ingredient_id, prep_type, quantity, unit,
       recipe_names, completed, completed_at)
    SELECT p_week_start, n.prep_date, n.cook_date, n.ingredient_id, n.prep_type,
           n.quantity, n.unit,
           COALESCE(ARRAY(SELECT jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(n.recipe_names) = 'array' THEN n.recipe_names ELSE '[]'::jsonb END
           )), '{}'::text[]),
           COALESCE(o.completed, false), o.completed_at
    FROM new n
    LEFT JOIN LATERAL (
      SELECT od.completed, od.completed_at
      FROM old od
      WHERE od.completed
        AND od.ingredient_id = n.ingredient_id
        AND od.prep_type = n.prep_type
        AND od.prep_date = n.prep_date
      LIMIT 1
    ) o ON TRUE
    RETURNING completed
  )
  SELECT
    (SELECT count(*) FROM ins),
    (SELECT count(*) FROM ins WHERE completed),
    (SELECT count(*) FROM old od
       WHERE od.completed
         AND NOT EXISTS (
           SELECT 1 FROM new n
           WHERE n.ingredient_id = od.ingredient_id
             AND n.prep_type = od.prep_type
             AND n.prep_date = od.prep_date))
  INTO v_inserted, v_preserved, v_dropped;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'preserved_completed', v_preserved,
    'dropped_completed', v_dropped
  );
END;
$$;

REVOKE ALL ON FUNCTION regenerate_prep_tasks(date, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION regenerate_prep_tasks(date, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- Customers could read/insert/update but not delete their own reviews. Add DELETE
-- (meal_review_tags rows go via ON DELETE CASCADE).
-- ---------------------------------------------------------------------------
CREATE POLICY "Customer delete own" ON meal_reviews
  FOR DELETE USING (client_id = current_client_id());
