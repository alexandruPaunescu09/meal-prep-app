-- FD-7: client goal weight. Macro targets (protein/fat per kg) are computed on
-- target_weight_kg when set, otherwise on the current weight_kg.
-- No RLS change: customers already read their own clients row, and the new
-- column is covered by the existing row-level policies.
ALTER TABLE clients
  ADD COLUMN target_weight_kg numeric
  CHECK (target_weight_kg IS NULL OR (target_weight_kg >= 30 AND target_weight_kg <= 300));

COMMENT ON COLUMN clients.target_weight_kg IS
  'Goal weight in kg (30-300). When set, per-kg macro targets use it instead of weight_kg.';
