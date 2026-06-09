-- Customer-facing reviews and meal-status tracking.
-- Mirrors the row-presence pattern of shopping_check_state / cooking_check_state.

-- Admin-managed quick-tag chips shown in the customer review composer.
CREATE TABLE review_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_review_tags_active_sort ON review_tags(active, sort_order);

-- Seed starter tags. Admin can edit on the settings page.
INSERT INTO review_tags (label, sentiment, sort_order) VALUES
  ('Loved it', 'positive', 10),
  ('Perfect portion', 'positive', 20),
  ('Tasty', 'positive', 30),
  ('Filling', 'positive', 40),
  ('Too salty', 'negative', 110),
  ('Too small', 'negative', 120),
  ('Too bland', 'negative', 130),
  ('Reheat issues', 'negative', 140),
  ('Repetitive', 'negative', 150);

-- One review per meal-plan slot. UNIQUE on entry_id keeps the customer
-- editing in place rather than duplicating reviews per slot.
CREATE TABLE meal_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_entry_id UUID NOT NULL UNIQUE
    REFERENCES meal_plan_entries(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Denormalized so aggregate stats survive entry deletion.
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  photo_path TEXT,
  admin_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_meal_reviews_client ON meal_reviews(client_id, created_at DESC);
CREATE INDEX idx_meal_reviews_recipe ON meal_reviews(recipe_id);
CREATE INDEX idx_meal_reviews_unread ON meal_reviews(admin_read_at) WHERE admin_read_at IS NULL;

CREATE TRIGGER meal_reviews_updated_at
  BEFORE UPDATE ON meal_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Junction
CREATE TABLE meal_review_tags (
  review_id UUID NOT NULL REFERENCES meal_reviews(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES review_tags(id) ON DELETE RESTRICT,
  PRIMARY KEY (review_id, tag_id)
);

CREATE INDEX idx_meal_review_tags_tag ON meal_review_tags(tag_id);

-- 3-state status. Absence = pending; row presence = eaten or skipped.
CREATE TABLE meal_entry_status (
  meal_plan_entry_id UUID PRIMARY KEY
    REFERENCES meal_plan_entries(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('eaten', 'skipped')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_meal_entry_status_client ON meal_entry_status(client_id);

-- Aggregate ratings, computed live. Used in admin recipe pages + meal-plan grid.
CREATE OR REPLACE VIEW recipe_rating_stats AS
  SELECT
    recipe_id,
    AVG(rating)::NUMERIC(3,2) AS avg_rating,
    COUNT(*)::INT AS review_count,
    MAX(created_at) AS last_reviewed_at
  FROM meal_reviews
  WHERE recipe_id IS NOT NULL
  GROUP BY recipe_id;

-- RLS
ALTER TABLE review_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_review_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_entry_status ENABLE ROW LEVEL SECURITY;

-- Tags: admin manages, customers read active tags only.
CREATE POLICY "Admin full access" ON review_tags
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Customer read active" ON review_tags
  FOR SELECT USING (current_client_id() IS NOT NULL AND active = TRUE);

-- Reviews: admin reads all + can update admin_read_at; customers manage their own.
CREATE POLICY "Admin read" ON meal_reviews
  FOR SELECT USING (is_admin());
CREATE POLICY "Admin update" ON meal_reviews
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin delete" ON meal_reviews
  FOR DELETE USING (is_admin());

CREATE POLICY "Customer read own" ON meal_reviews
  FOR SELECT USING (client_id = current_client_id());
CREATE POLICY "Customer insert own" ON meal_reviews
  FOR INSERT WITH CHECK (client_id = current_client_id());
CREATE POLICY "Customer update own" ON meal_reviews
  FOR UPDATE USING (client_id = current_client_id())
  WITH CHECK (client_id = current_client_id());

-- Junction follows the parent review's permissions.
CREATE POLICY "Admin full access" ON meal_review_tags
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Customer manage own" ON meal_review_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM meal_reviews mr
      WHERE mr.id = meal_review_tags.review_id
        AND mr.client_id = current_client_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM meal_reviews mr
      WHERE mr.id = meal_review_tags.review_id
        AND mr.client_id = current_client_id()
    )
  );

-- Status: admin reads all; customers manage their own.
CREATE POLICY "Admin read" ON meal_entry_status
  FOR SELECT USING (is_admin());
CREATE POLICY "Customer manage own" ON meal_entry_status
  FOR ALL USING (client_id = current_client_id())
  WITH CHECK (client_id = current_client_id());
