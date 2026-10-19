-- FD-9: customer weight log. One row per client per LOCAL calendar day (a second log the same
-- day upserts). Customers manage their own rows; the admin has full access.

CREATE TABLE weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- The customer's LOCAL calendar date (never derive from UTC).
  log_date DATE NOT NULL,
  -- Range mirrors the intake form (20-300 kg).
  weight_kg NUMERIC NOT NULL CHECK (weight_kg >= 20 AND weight_kg <= 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT weight_logs_client_date_key UNIQUE (client_id, log_date)
);

CREATE TRIGGER weight_logs_updated_at
  BEFORE UPDATE ON weight_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON weight_logs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Customer manage own" ON weight_logs
  FOR ALL USING (client_id = current_client_id())
  WITH CHECK (client_id = current_client_id());
