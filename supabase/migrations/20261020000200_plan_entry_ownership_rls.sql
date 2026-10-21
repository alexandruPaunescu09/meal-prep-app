-- Customers could write a meal_entry_status / meal_reviews row for ANY meal_plan_entry
-- (the policies only compared client_id), which filled another customer's slot (unique on
-- meal_plan_entry_id) and blocked their own write. Require that the entry belongs to a plan
-- of the calling customer, on both USING and WITH CHECK (so UPDATE cannot repoint a row).

-- SECURITY DEFINER so the check does not depend on the caller's RLS on plans/entries.
CREATE OR REPLACE FUNCTION owns_plan_entry(p_entry_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM meal_plan_entries e
    JOIN meal_plans p ON p.id = e.meal_plan_id
    WHERE e.id = p_entry_id
      AND p.client_id IS NOT NULL
      AND p.client_id = current_client_id()
  );
$$;

REVOKE ALL ON FUNCTION owns_plan_entry(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION owns_plan_entry(uuid) FROM anon;
-- The policies below are TO authenticated so anon (no EXECUTE) never evaluates the helper.
GRANT EXECUTE ON FUNCTION owns_plan_entry(uuid) TO authenticated;

DROP POLICY IF EXISTS "Customer manage own" ON meal_entry_status;
CREATE POLICY "Customer manage own" ON meal_entry_status
  FOR ALL TO authenticated
  USING (client_id = current_client_id() AND owns_plan_entry(meal_plan_entry_id))
  WITH CHECK (client_id = current_client_id() AND owns_plan_entry(meal_plan_entry_id));

DROP POLICY IF EXISTS "Customer insert own" ON meal_reviews;
CREATE POLICY "Customer insert own" ON meal_reviews
  FOR INSERT TO authenticated
  WITH CHECK (client_id = current_client_id() AND owns_plan_entry(meal_plan_entry_id));

DROP POLICY IF EXISTS "Customer update own" ON meal_reviews;
CREATE POLICY "Customer update own" ON meal_reviews
  FOR UPDATE TO authenticated
  USING (client_id = current_client_id() AND owns_plan_entry(meal_plan_entry_id))
  WITH CHECK (client_id = current_client_id() AND owns_plan_entry(meal_plan_entry_id));

-- "Customer delete own" (meal_reviews) is intentionally unchanged: customers must be able to
-- remove any stray row of their own. meal_review_tags already requires the parent review to
-- be the caller's, and reviews can no longer point at someone else's entry.
