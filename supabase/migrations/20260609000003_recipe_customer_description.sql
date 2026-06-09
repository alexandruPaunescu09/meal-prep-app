-- Customer-facing description on recipes (admin notes stay private)
-- and invited_at on clients to track portal invite state.

ALTER TABLE recipes
  ADD COLUMN customer_description TEXT;

ALTER TABLE clients
  ADD COLUMN invited_at TIMESTAMPTZ;
