-- RI-3: atomic save for the recipe import review screen.
-- Creates the recipe through save_recipe (so source_url / instructions handling lives in one
-- place) and remembers the raw ingredient names as aliases with the fixed store 'recipe',
-- all in ONE transaction. Any failure (unknown ingredient id, bad quantity...) rolls back
-- the recipe and the aliases together.
-- p_recipe:      same keys as save_recipe (callers send every key)
-- p_ingredients: [{ingredient_id, quantity}]
-- p_aliases:     [{alias, ingredient_id}]  (may be empty or NULL)
-- An existing alias with the same name (case-insensitive) is repointed to the new ingredient.
-- House pattern: SECURITY INVOKER, is_admin() guard, EXECUTE revoked from PUBLIC.
CREATE OR REPLACE FUNCTION save_imported_recipe(p_recipe jsonb, p_ingredients jsonb, p_aliases jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_alias jsonb;
  v_name TEXT;
  v_ing_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_id := save_recipe(NULL, p_recipe, p_ingredients);

  IF p_aliases IS NOT NULL THEN
    IF jsonb_typeof(p_aliases) <> 'array' THEN
      RAISE EXCEPTION 'p_aliases must be a JSON array';
    END IF;
    FOR v_alias IN SELECT * FROM jsonb_array_elements(p_aliases)
    LOOP
      v_name := btrim(COALESCE(v_alias->>'alias', ''));
      v_ing_id := NULLIF(v_alias->>'ingredient_id', '')::uuid;
      IF v_name = '' OR v_ing_id IS NULL THEN
        RAISE EXCEPTION 'alias line needs alias and ingredient_id';
      END IF;
      INSERT INTO ingredient_aliases (ingredient_id, store, alias)
      VALUES (v_ing_id, 'recipe', v_name)
      ON CONFLICT (store, lower(alias))
      DO UPDATE SET ingredient_id = EXCLUDED.ingredient_id;
    END LOOP;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION save_imported_recipe(jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_imported_recipe(jsonb, jsonb, jsonb) TO authenticated;
