CREATE TABLE ingredient_price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  package_price NUMERIC NOT NULL,
  quantity_purchased NUMERIC NOT NULL,
  unit TEXT NOT NULL DEFAULT 'g',
  price_per_unit NUMERIC NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_history_ingredient ON ingredient_price_history(ingredient_id, recorded_at DESC);

ALTER TABLE ingredient_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON ingredient_price_history
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
