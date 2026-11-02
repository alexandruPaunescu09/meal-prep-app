-- SE-0: recipe seasonings. A recipe line carries a role ('main' | 'seasoning') and a "to taste"
-- flag; a to-taste line stores quantity 0 so cost/nutrition/shopping math keeps working.
-- ingredients.is_seasoning only sets the DEFAULT role when an ingredient is added to a recipe.
-- ingredients_public / recipes_public are intentionally NOT changed (no is_seasoning there).

ALTER TABLE recipe_ingredients
  ADD COLUMN role TEXT NOT NULL DEFAULT 'main' CHECK (role IN ('main', 'seasoning')),
  ADD COLUMN to_taste BOOLEAN NOT NULL DEFAULT false,
  ADD CONSTRAINT recipe_ingredients_to_taste_valid
    CHECK (NOT to_taste OR (role = 'seasoning' AND quantity = 0));

ALTER TABLE ingredients
  ADD COLUMN is_seasoning BOOLEAN NOT NULL DEFAULT false;

-- save_recipe: each line also takes {role, to_taste}. Missing/empty role -> 'main', missing
-- to_taste -> false. A to_taste line must be a seasoning with quantity 0; every other line
-- needs quantity > 0. Everything else is unchanged from RI-0b.
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
  v_instructions jsonb;
  v_role TEXT;
  v_to_taste BOOLEAN;
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

  v_instructions := COALESCE(p_recipe->'instructions', '[]'::jsonb);
  IF jsonb_typeof(v_instructions) = 'null' THEN
    v_instructions := '[]'::jsonb;
  END IF;
  IF jsonb_typeof(v_instructions) <> 'array' THEN
    RAISE EXCEPTION 'instructions must be a JSON array';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_ingredients)
  LOOP
    v_ing_id := NULLIF(v_line->>'ingredient_id', '')::uuid;
    v_qty := NULLIF(v_line->>'quantity', '')::numeric;
    IF v_ing_id IS NULL THEN
      RAISE EXCEPTION 'ingredient line is missing ingredient_id';
    END IF;
    v_role := COALESCE(NULLIF(btrim(COALESCE(v_line->>'role', '')), ''), 'main');
    IF v_role NOT IN ('main', 'seasoning') THEN
      RAISE EXCEPTION 'role must be main or seasoning (ingredient %)', v_ing_id;
    END IF;
    v_to_taste := COALESCE(NULLIF(v_line->>'to_taste', '')::boolean, false);
    IF v_to_taste THEN
      IF v_role <> 'seasoning' THEN
        RAISE EXCEPTION 'only a seasoning can be to taste (ingredient %)', v_ing_id;
      END IF;
      IF v_qty IS NULL OR v_qty <> 0 THEN
        RAISE EXCEPTION 'a to-taste line must have quantity 0 (ingredient %)', v_ing_id;
      END IF;
    ELSIF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'quantity must be greater than 0 (ingredient %)', v_ing_id;
    END IF;
  END LOOP;

  IF p_recipe_id IS NULL THEN
    INSERT INTO recipes (name, portions, final_weight, notes, customer_description, container_type_id, source_url, instructions)
    VALUES (
      v_name,
      v_portions,
      NULLIF(p_recipe->>'final_weight', '')::numeric,
      NULLIF(p_recipe->>'notes', ''),
      NULLIF(p_recipe->>'customer_description', ''),
      NULLIF(p_recipe->>'container_type_id', '')::uuid,
      NULLIF(btrim(COALESCE(p_recipe->>'source_url', '')), ''),
      v_instructions
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE recipes
    SET name = v_name,
        portions = v_portions,
        final_weight = NULLIF(p_recipe->>'final_weight', '')::numeric,
        notes = NULLIF(p_recipe->>'notes', ''),
        customer_description = NULLIF(p_recipe->>'customer_description', ''),
        container_type_id = NULLIF(p_recipe->>'container_type_id', '')::uuid,
        source_url = NULLIF(btrim(COALESCE(p_recipe->>'source_url', '')), ''),
        instructions = v_instructions
    WHERE id = p_recipe_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'recipe % not found', p_recipe_id;
    END IF;
    DELETE FROM recipe_ingredients WHERE recipe_id = v_id;
  END IF;

  INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, role, to_taste)
  SELECT v_id,
         (l->>'ingredient_id')::uuid,
         (l->>'quantity')::numeric,
         COALESCE(NULLIF(btrim(COALESCE(l->>'role', '')), ''), 'main'),
         COALESCE(NULLIF(l->>'to_taste', '')::boolean, false)
  FROM jsonb_array_elements(p_ingredients) AS l;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION save_recipe(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_recipe(uuid, jsonb, jsonb) TO authenticated;
