-- FD-12: merge a duplicate catalog food into another one.
-- House pattern: SECURITY INVOKER (RLS still applies), is_admin() guard,
-- EXECUTE revoked from PUBLIC and granted to authenticated.
--
-- Semantics (p_from is the duplicate that disappears, p_into survives):
--  * p_from = p_into, or either row missing -> error, nothing changes.
--  * food_log_entries.food_id is repointed to p_into. The nutrition SNAPSHOT columns
--    (name, calories, ...) are NOT touched: past diary days keep what the customer saw.
--  * food_favorites.food_id is repointed too. Clients who already favour p_into would violate
--    the partial UNIQUE (client_id, food_id), so p_from's favorite is deleted for them first.
--  * Barcode: if p_into has none and p_from has one, it moves to p_into (cleared on p_from
--    first, because foods.barcode is UNIQUE). If both have one, p_into keeps its own.
--  * Finally p_from is deleted. Its promoted_ingredient_id, photos and verification are not
--    carried over (the survivor is the record of truth).
-- Returns {entries, favorites_moved, favorites_dropped, barcode_moved}.
-- The admin could only SELECT food_log_entries (customer data). Merging needs UPDATE, otherwise RLS
-- silently matches zero rows and deleting the duplicate would null every entry's food_id (SET NULL).
-- Scoped to admins; the function additionally verifies that no entry is left behind.
DROP POLICY IF EXISTS "Admin repoint food" ON food_log_entries;
CREATE POLICY "Admin repoint food" ON food_log_entries
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION merge_foods(p_from uuid, p_into uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_from_barcode TEXT;
  v_into_barcode TEXT;
  v_entries INT;
  v_fav_dropped INT;
  v_fav_moved INT;
  v_barcode_moved BOOLEAN := FALSE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_from IS NULL OR p_into IS NULL THEN
    RAISE EXCEPTION 'both foods are required';
  END IF;
  IF p_from = p_into THEN
    RAISE EXCEPTION 'cannot merge a food into itself';
  END IF;

  SELECT barcode INTO v_from_barcode FROM foods WHERE id = p_from FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'food to merge not found';
  END IF;
  SELECT barcode INTO v_into_barcode FROM foods WHERE id = p_into FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'target food not found';
  END IF;

  UPDATE food_log_entries SET food_id = p_into WHERE food_id = p_from;
  GET DIAGNOSTICS v_entries = ROW_COUNT;
  IF EXISTS (SELECT 1 FROM food_log_entries WHERE food_id = p_from) THEN
    RAISE EXCEPTION 'could not repoint all diary entries';
  END IF;

  DELETE FROM food_favorites f
  WHERE f.food_id = p_from
    AND EXISTS (
      SELECT 1 FROM food_favorites k WHERE k.food_id = p_into AND k.client_id = f.client_id
    );
  GET DIAGNOSTICS v_fav_dropped = ROW_COUNT;

  UPDATE food_favorites SET food_id = p_into WHERE food_id = p_from;
  GET DIAGNOSTICS v_fav_moved = ROW_COUNT;

  IF v_into_barcode IS NULL AND v_from_barcode IS NOT NULL THEN
    UPDATE foods SET barcode = NULL WHERE id = p_from;
    UPDATE foods SET barcode = v_from_barcode, updated_at = now() WHERE id = p_into;
    v_barcode_moved := TRUE;
  END IF;

  DELETE FROM foods WHERE id = p_from;

  RETURN jsonb_build_object(
    'entries', v_entries,
    'favorites_moved', v_fav_moved,
    'favorites_dropped', v_fav_dropped,
    'barcode_moved', v_barcode_moved
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION merge_foods(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_foods(uuid, uuid) TO authenticated;
