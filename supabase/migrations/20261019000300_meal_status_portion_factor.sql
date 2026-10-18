-- FD-2: "Ate a different amount" on an eaten plan meal.
-- NULL = 1x (the whole planned portion). Only meaningful while status = 'eaten';
-- the API clears it for any other status. Existing RLS policies cover the new column.
ALTER TABLE meal_entry_status
  ADD COLUMN portion_factor NUMERIC
  CHECK (portion_factor IS NULL OR (portion_factor > 0 AND portion_factor <= 5));
