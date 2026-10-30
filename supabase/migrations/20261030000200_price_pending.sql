-- RI-0c: price pending. A new ingredient may be saved before its price is
-- known (NULL package_price = price pending); the generated price_per_unit
-- becomes NULL with it. quantity_purchased stays NOT NULL.
ALTER TABLE ingredients ALTER COLUMN package_price DROP NOT NULL;

-- apply_invoice_prices: a NULL stored price means "no old price". The update
-- still counts as updated, but no ingredient_price_history row is written
-- (it would log a bogus 0, and that table's package_price is NOT NULL).
-- Same guard, validation, grants and return shape as before.
CREATE OR REPLACE FUNCTION apply_invoice_prices(p_invoice jsonb, p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invoice_id UUID;
  v_store TEXT;
  v_line jsonb;
  v_ing ingredients%ROWTYPE;
  v_ing_id UUID;
  v_new_price NUMERIC;
  v_new_qty NUMERIC;
  v_raw_name TEXT;
  v_old_ppu NUMERIC;
  v_new_ppu NUMERIC;
  v_updated INT := 0;
  v_unchanged INT := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_store := p_invoice->>'store';
  IF v_store IS NULL OR btrim(v_store) = '' THEN
    RAISE EXCEPTION 'store is required';
  END IF;

  INSERT INTO invoices (store, invoice_date, total, file_names, parsed, applied_lines, model)
  VALUES (
    v_store,
    NULLIF(p_invoice->>'invoice_date', '')::date,
    NULLIF(p_invoice->>'total', '')::numeric,
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(p_invoice->'file_names') = 'array'
             THEN p_invoice->'file_names' ELSE '[]'::jsonb END)),
      '{}'::text[]
    ),
    CASE WHEN p_invoice->'parsed' = 'null'::jsonb THEN NULL ELSE p_invoice->'parsed' END,
    p_lines,
    NULLIF(p_invoice->>'model', '')
  )
  RETURNING id INTO v_invoice_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_ing_id    := (v_line->>'ingredient_id')::uuid;
    v_new_price := (v_line->>'package_price')::numeric;
    v_new_qty   := (v_line->>'quantity_purchased')::numeric;
    v_raw_name  := btrim(COALESCE(v_line->>'raw_name', ''));

    IF v_ing_id IS NULL THEN
      RAISE EXCEPTION 'line is missing ingredient_id';
    END IF;
    IF v_new_price IS NULL OR v_new_price <= 0 THEN
      RAISE EXCEPTION 'package_price must be greater than 0 (ingredient %)', v_ing_id;
    END IF;
    IF v_new_qty IS NULL OR v_new_qty <= 0 THEN
      RAISE EXCEPTION 'quantity_purchased must be greater than 0 (ingredient %)', v_ing_id;
    END IF;

    SELECT * INTO v_ing FROM ingredients WHERE id = v_ing_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ingredient % not found', v_ing_id;
    END IF;

    v_old_ppu := v_ing.package_price / NULLIF(v_ing.quantity_purchased, 0);
    v_new_ppu := v_new_price / v_new_qty;

    IF v_new_price IS DISTINCT FROM v_ing.package_price
       OR v_new_qty IS DISTINCT FROM v_ing.quantity_purchased THEN
      -- Log the old values only when there WAS a price and the per-unit price
      -- really differs (exact comparison); a pure package-size change is not a
      -- price change, and a price-pending ingredient has no old price to log.
      IF v_ing.package_price IS NOT NULL
         AND v_old_ppu IS DISTINCT FROM v_new_ppu THEN
        INSERT INTO ingredient_price_history
          (ingredient_id, package_price, quantity_purchased, unit, price_per_unit)
        VALUES
          (v_ing.id, v_ing.package_price, v_ing.quantity_purchased, v_ing.unit, v_old_ppu);
      END IF;

      -- price_per_unit is GENERATED; only write its inputs.
      UPDATE ingredients
      SET package_price = v_new_price, quantity_purchased = v_new_qty
      WHERE id = v_ing.id;

      v_updated := v_updated + 1;
    ELSE
      v_unchanged := v_unchanged + 1;
    END IF;

    IF v_raw_name <> '' THEN
      INSERT INTO ingredient_aliases (ingredient_id, store, alias)
      VALUES (v_ing.id, v_store, v_raw_name)
      ON CONFLICT (store, lower(alias))
      DO UPDATE SET ingredient_id = EXCLUDED.ingredient_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'updated', v_updated,
    'unchanged', v_unchanged
  );
END;
$$;

REVOKE ALL ON FUNCTION apply_invoice_prices(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_invoice_prices(jsonb, jsonb) TO authenticated;
