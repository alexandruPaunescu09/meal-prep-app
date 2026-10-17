-- Invoice / receipt price import.
-- invoices rows are written ONLY when the admin approves an import (via apply_invoice_prices).

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store TEXT NOT NULL,
  invoice_date DATE,
  total NUMERIC,
  file_names TEXT[] NOT NULL DEFAULT '{}',
  parsed JSONB,          -- raw model output
  applied_lines JSONB,   -- lines the admin approved
  model TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invoices_store_date ON invoices(store, invoice_date);

CREATE TABLE ingredient_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  store TEXT NOT NULL,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_ingredient_aliases_store_alias ON ingredient_aliases(store, lower(alias));
CREATE INDEX idx_ingredient_aliases_ingredient ON ingredient_aliases(ingredient_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON invoices
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin full access" ON ingredient_aliases
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Atomically records an invoice, updates ingredient prices (logging old values
-- to ingredient_price_history) and upserts store aliases.
-- p_invoice: {store, invoice_date, total, file_names[], model, parsed}
-- p_lines:   [{ingredient_id, package_price, quantity_purchased, raw_name}]
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

    SELECT * INTO v_ing FROM ingredients WHERE id = v_ing_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ingredient % not found', v_ing_id;
    END IF;

    v_old_ppu := COALESCE(v_ing.package_price / NULLIF(v_ing.quantity_purchased, 0), 0);
    v_new_ppu := COALESCE(v_new_price / NULLIF(v_new_qty, 0), 0);

    IF abs(v_old_ppu - v_new_ppu) <= 0.0001 THEN
      v_unchanged := v_unchanged + 1;
    ELSE
      INSERT INTO ingredient_price_history
        (ingredient_id, package_price, quantity_purchased, unit, price_per_unit)
      VALUES
        (v_ing.id, v_ing.package_price, v_ing.quantity_purchased, v_ing.unit, v_old_ppu);

      -- price_per_unit is GENERATED; only write its inputs.
      UPDATE ingredients
      SET package_price = v_new_price, quantity_purchased = v_new_qty
      WHERE id = v_ing.id;

      v_updated := v_updated + 1;
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

GRANT EXECUTE ON FUNCTION apply_invoice_prices(jsonb, jsonb) TO authenticated;
