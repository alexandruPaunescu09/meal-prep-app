-- Abuse limits (hardening H4): atomic rate limiting for the public intake endpoint and atomic
-- per-customer quotas for new foods and label parses. Additive only.

-- ---------------------------------------------------------------------------
-- rate_limit_hits: one row per allowed hit, keyed by a bucket name and a hashed caller key
-- (SHA-256 of the IP; raw IPs are never stored). Service-role only: RLS on, no policies.
-- ---------------------------------------------------------------------------
CREATE TABLE rate_limit_hits (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rate_limit_hits_lookup ON rate_limit_hits (bucket, key_hash, created_at DESC);
CREATE INDEX idx_rate_limit_hits_created ON rate_limit_hits (created_at);
ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate_limit_hits FROM PUBLIC, anon, authenticated;

-- Returns true and records a hit when fewer than p_limit hits exist in the window, else false.
-- The advisory lock serialises callers sharing a (bucket, key) so the check cannot be raced.
CREATE FUNCTION check_rate_limit(p_bucket text, p_key_hash text, p_limit int, p_window interval)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_bucket || ':' || p_key_hash));

  -- Opportunistic cleanup (a small fraction of calls) of rows no window needs any more.
  IF random() < 0.05 THEN
    DELETE FROM rate_limit_hits WHERE created_at < now() - interval '1 day';
  END IF;

  SELECT count(*) INTO v_count
    FROM rate_limit_hits
   WHERE bucket = p_bucket AND key_hash = p_key_hash AND created_at > now() - p_window;
  IF v_count >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO rate_limit_hits (bucket, key_hash) VALUES (p_bucket, p_key_hash);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION check_rate_limit(text, text, int, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit(text, text, int, interval) TO service_role;

-- ---------------------------------------------------------------------------
-- create_food_with_quota: inserts a foods row unless the creator already added p_limit foods in
-- the last 24 hours. Returns the new food id, or NULL when over quota. A barcode unique conflict
-- (23505) propagates to the caller, who then returns the existing row. Called by the barcode and
-- label-confirm routes with the service client.
-- ---------------------------------------------------------------------------
CREATE FUNCTION create_food_with_quota(p_client_id uuid, p_food jsonb, p_limit int)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('food-quota:' || p_client_id::text));

  SELECT count(*) INTO v_count
    FROM foods
   WHERE created_by_client_id = p_client_id AND created_at >= now() - interval '24 hours';
  IF v_count >= p_limit THEN
    RETURN NULL;
  END IF;

  INSERT INTO foods (
    id, barcode, name, brand, unit, calories, protein, carbs, fat, fiber, sugar, sat_fat, salt,
    micronutrients, serving_size, serving_label, package_size, source, status,
    created_by_client_id, label_photo_path, front_photo_path
  ) VALUES (
    COALESCE((p_food->>'id')::uuid, gen_random_uuid()),
    p_food->>'barcode',
    p_food->>'name',
    p_food->>'brand',
    COALESCE(p_food->>'unit', 'g'),
    (p_food->>'calories')::numeric,
    (p_food->>'protein')::numeric,
    (p_food->>'carbs')::numeric,
    (p_food->>'fat')::numeric,
    (p_food->>'fiber')::numeric,
    (p_food->>'sugar')::numeric,
    (p_food->>'sat_fat')::numeric,
    (p_food->>'salt')::numeric,
    COALESCE(p_food->'micronutrients', '{}'::jsonb),
    (p_food->>'serving_size')::numeric,
    p_food->>'serving_label',
    (p_food->>'package_size')::numeric,
    p_food->>'source',
    COALESCE(p_food->>'status', 'active'),
    p_client_id,
    p_food->>'label_photo_path',
    p_food->>'front_photo_path'
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_food_with_quota(uuid, jsonb, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_food_with_quota(uuid, jsonb, int) TO service_role;

-- ---------------------------------------------------------------------------
-- reserve_label_parse: atomically counts the customer's parses in the last 24 hours and, when under
-- the limit, records the attempt (outcome 'error' until the route sets the real one). Returns the
-- new row id, or NULL when over the limit.
-- ---------------------------------------------------------------------------
CREATE FUNCTION reserve_label_parse(p_client_id uuid, p_model text, p_limit int)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('label-parse:' || p_client_id::text));

  SELECT count(*) INTO v_count
    FROM food_label_parses
   WHERE client_id = p_client_id AND created_at >= now() - interval '24 hours';
  IF v_count >= p_limit THEN
    RETURN NULL;
  END IF;

  INSERT INTO food_label_parses (client_id, model, outcome)
  VALUES (p_client_id, p_model, 'error')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION reserve_label_parse(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reserve_label_parse(uuid, text, int) TO service_role;
