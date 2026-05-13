CREATE TABLE container_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  meal_plan_id UUID REFERENCES meal_plans(id) ON DELETE SET NULL,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE container_delivery_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_id UUID NOT NULL REFERENCES container_deliveries(id) ON DELETE CASCADE,
  container_type_id UUID NOT NULL REFERENCES container_types(id) ON DELETE RESTRICT,
  quantity_sent INT NOT NULL DEFAULT 0,
  quantity_returned INT NOT NULL DEFAULT 0
);

ALTER TABLE clients ADD COLUMN container_tolerance INT NOT NULL DEFAULT 2;

ALTER TABLE container_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE container_delivery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON container_deliveries
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated full access" ON container_delivery_items
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_deliveries_client ON container_deliveries(client_id, delivery_date DESC);
