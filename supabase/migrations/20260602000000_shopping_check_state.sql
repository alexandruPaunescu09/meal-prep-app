CREATE TABLE shopping_check_state (
  week_start DATE NOT NULL,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, ingredient_id)
);

ALTER TABLE shopping_check_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth full access" ON shopping_check_state
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX shopping_check_state_week_idx ON shopping_check_state(week_start);
