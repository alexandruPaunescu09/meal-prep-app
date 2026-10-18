-- clone_week: rename cloned plans so the week range in the name follows the new
-- week ("Ana – 12–18 Oct 2026" -> "Ana – 19–25 Oct 2026"). Customers see plan
-- names in the portal, so stale dates were misleading. Names that do not contain
-- the source week's range are kept unchanged.

-- Mirrors formatWeekRange() in lib/format.ts ("19–25 Oct 2026", "28 Oct – 3 Nov 2026").
CREATE OR REPLACE FUNCTION format_week_range(p_week_start date)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN extract(year FROM p_week_start) <> extract(year FROM p_week_start + 6) THEN
      extract(day FROM p_week_start)::int || ' ' || (ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month FROM p_week_start)::int] || ' ' || extract(year FROM p_week_start)::int
      || ' ' || chr(8211) || ' ' ||
      extract(day FROM p_week_start + 6)::int || ' ' || (ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month FROM p_week_start + 6)::int] || ' ' || extract(year FROM p_week_start + 6)::int
    WHEN extract(month FROM p_week_start) <> extract(month FROM p_week_start + 6) THEN
      extract(day FROM p_week_start)::int || ' ' || (ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month FROM p_week_start)::int]
      || ' ' || chr(8211) || ' ' ||
      extract(day FROM p_week_start + 6)::int || ' ' || (ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month FROM p_week_start + 6)::int] || ' ' || extract(year FROM p_week_start + 6)::int
    ELSE
      extract(day FROM p_week_start)::int || chr(8211) || extract(day FROM p_week_start + 6)::int
      || ' ' || (ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month FROM p_week_start + 6)::int] || ' ' || extract(year FROM p_week_start + 6)::int
  END;
$$;

CREATE OR REPLACE FUNCTION clone_week(p_source_week date, p_target_week date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_plan meal_plans%ROWTYPE;
  v_created uuid[] := '{}';
  v_skipped INT := 0;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_source_week IS NULL OR p_target_week IS NULL THEN
    RAISE EXCEPTION 'source and target weeks are required';
  END IF;
  IF p_source_week = p_target_week THEN
    RAISE EXCEPTION 'source and target week must differ';
  END IF;

  FOR v_plan IN
    SELECT * FROM meal_plans WHERE week_start = p_source_week ORDER BY created_at, id
  LOOP
    IF v_plan.client_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM meal_plans t
      WHERE t.week_start = p_target_week AND t.client_id = v_plan.client_id
    ) THEN
      v_skipped := v_skipped + 1;
    ELSE
      v_created := v_created || duplicate_meal_plan(
        v_plan.id,
        replace(v_plan.name, format_week_range(p_source_week), format_week_range(p_target_week)),
        v_plan.client_id, p_target_week, v_plan.markup_multiplier
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', to_jsonb(v_created), 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION clone_week(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clone_week(date, date) TO authenticated;
