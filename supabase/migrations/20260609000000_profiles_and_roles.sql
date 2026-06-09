-- Profiles + role-based access for the customer-facing portal
-- Each auth.users row gets one profiles row. role is mutually exclusive.
-- Customer profiles are linked to a clients row via client_id.

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'customer')),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT customer_must_have_client CHECK (
    role = 'admin' OR (role = 'customer' AND client_id IS NOT NULL)
  )
);

CREATE INDEX idx_profiles_client_id ON profiles(client_id);
CREATE INDEX idx_profiles_role ON profiles(role);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Helper functions used by RLS policies. SECURITY DEFINER bypasses RLS so
-- the helper itself can read profiles without triggering its own policies.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION current_client_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT client_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Trigger: when a new auth.users row is inserted, materialize a profile.
-- If their email matches an existing clients row → customer + linked.
-- Otherwise → no row. Admins are backfilled below; further admins must be
-- inserted by an existing admin via service role.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_client_id UUID;
BEGIN
  SELECT id INTO matched_client_id
  FROM clients
  WHERE lower(email) = lower(NEW.email)
  LIMIT 1;

  IF matched_client_id IS NOT NULL THEN
    INSERT INTO profiles (id, role, client_id)
    VALUES (NEW.id, 'customer', matched_client_id)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_auth_user();

-- Profile policies
CREATE POLICY "Users see their own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Admins see all profiles" ON profiles
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins manage profiles" ON profiles
  FOR ALL USING (is_admin())
  WITH CHECK (is_admin());

-- Backfill: any existing authenticated user is treated as the original admin.
-- This is the single-admin migration — additional admins must be added manually.
INSERT INTO profiles (id, role, client_id)
SELECT id, 'admin', NULL FROM auth.users
ON CONFLICT (id) DO NOTHING;
