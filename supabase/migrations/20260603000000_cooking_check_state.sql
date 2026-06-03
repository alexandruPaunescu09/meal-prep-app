CREATE TABLE cooking_check_state (
  week_start DATE NOT NULL,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, recipe_id)
);

ALTER TABLE cooking_check_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth full access" ON cooking_check_state
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX cooking_check_state_week_idx ON cooking_check_state(week_start);
