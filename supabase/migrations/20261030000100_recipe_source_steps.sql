-- RI-0b: recipe source link + cooking steps.
-- recipes.source_url: where the recipe came from (http/https). recipes.instructions: ordered
-- array of plain-text steps (1-500 chars each, max 40). Neither column is added to
-- recipes_public: customers never receive them.

CREATE OR REPLACE FUNCTION recipe_instructions_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_typeof(p) = 'array'
     AND jsonb_array_length(p) <= 40
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p) AS e
       WHERE jsonb_typeof(e) <> 'string'
          OR char_length(e #>> '{}') NOT BETWEEN 1 AND 500
     );
$$;

ALTER TABLE recipes
  ADD COLUMN source_url TEXT,
  ADD COLUMN instructions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT recipes_source_url_http CHECK (source_url IS NULL OR source_url ~* '^https?://'),
  ADD CONSTRAINT recipes_instructions_valid CHECK (recipe_instructions_valid(instructions));

-- save_recipe: p_recipe now also takes {source_url, instructions}. Missing source_url -> NULL,
-- missing instructions -> '[]' (callers always send both).
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
    IF v_qty IS NULL OR v_qty <= 0 THEN
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

  INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity)
  SELECT v_id, (l->>'ingredient_id')::uuid, (l->>'quantity')::numeric
  FROM jsonb_array_elements(p_ingredients) AS l;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION save_recipe(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_recipe(uuid, jsonb, jsonb) TO authenticated;
