-- Weekly cooking plan is split into cook batches (Mon-Tue, Wed-Thu, Fri-Sat) and
-- cooked check-offs become per batch. first_day = the batch's first weekday (1, 3 or 5).
-- Sunday meal-plan entries are not part of the weekly cooking plan (meals are served Monday-Saturday), so they never get a check row.
-- Old whole-week checks become one row per batch in which that recipe is planned that week.

ALTER TABLE cooking_check_state DROP CONSTRAINT cooking_check_state_pkey;
ALTER TABLE cooking_check_state ADD COLUMN first_day SMALLINT;

-- first day of the batch: odd day = itself, even day = the day before
INSERT INTO cooking_check_state (week_start, recipe_id, checked_at, first_day)
SELECT DISTINCT c.week_start, c.recipe_id, c.checked_at,
       (e.day_of_week - ((e.day_of_week + 1) % 2))::smallint
FROM cooking_check_state c
JOIN meal_plans p ON p.week_start = c.week_start
JOIN meal_plan_entries e ON e.meal_plan_id = p.id AND e.recipe_id = c.recipe_id
WHERE c.first_day IS NULL AND e.day_of_week BETWEEN 1 AND 6;

-- Old rows (and checks for recipes no longer planned that week, never shown anyway)
DELETE FROM cooking_check_state WHERE first_day IS NULL;

ALTER TABLE cooking_check_state ALTER COLUMN first_day SET NOT NULL;
ALTER TABLE cooking_check_state
  ADD CONSTRAINT cooking_check_state_first_day_check CHECK (first_day IN (1, 3, 5));
ALTER TABLE cooking_check_state
  ADD PRIMARY KEY (week_start, recipe_id, first_day);
