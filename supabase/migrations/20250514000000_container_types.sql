CREATE TABLE container_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  volume_ml INT,
  cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE container_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON container_types
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER TABLE recipes ADD COLUMN container_type_id UUID REFERENCES container_types(id) ON DELETE SET NULL;
