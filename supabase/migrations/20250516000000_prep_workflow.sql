-- Configurable prep rules (per-category or per-ingredient)
CREATE TABLE prep_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_category TEXT,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
  prep_type TEXT NOT NULL,
  advance_days INT NOT NULL DEFAULT 0,
  time_estimate_minutes INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT prep_rule_has_target CHECK (
    ingredient_category IS NOT NULL OR ingredient_id IS NOT NULL
  )
);

-- Generated prep tasks (persisted per-week)
CREATE TABLE prep_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  prep_date DATE NOT NULL,
  cook_date DATE NOT NULL,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  prep_type TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  recipe_names TEXT[] NOT NULL DEFAULT '{}',
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_prep_rules_category ON prep_rules(ingredient_category);
CREATE INDEX idx_prep_rules_ingredient ON prep_rules(ingredient_id);
CREATE INDEX idx_prep_tasks_week ON prep_tasks(week_start, prep_date);

-- RLS
ALTER TABLE prep_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE prep_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON prep_rules
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated full access" ON prep_tasks
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
