-- LOCAL DEVELOPMENT SEED — runs only on `npm run db:reset` against the local
-- Docker Supabase. `supabase db push` does not run seeds, so none of this
-- reaches production.
--
-- Local admin login:  admin@mealprep.local / local-admin-pass
-- (test-only credentials for the local stack; never reuse them anywhere else)
-- QA customer (not seeded; register via /intake after a reset, matching a
-- client with this email): qa-customer@mealprep.local / qa-customer-pass

DO $$
DECLARE
  admin_id UUID := 'a0000000-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
    'admin@mealprep.local', extensions.crypt('local-admin-pass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), admin_id, admin_id::text,
    jsonb_build_object('sub', admin_id::text, 'email', 'admin@mealprep.local', 'email_verified', true),
    'email', now(), now(), now()
  );

  INSERT INTO profiles (id, role) VALUES (admin_id, 'admin')
  ON CONFLICT (id) DO UPDATE SET role = 'admin';
END $$;

-- Sample catalog of everyday Lidl / Freshful items so receipt matching has
-- something to match against. Prices in lei, nutrition per 100 g / 100 ml.
INSERT INTO ingredients
  (name, brand, category, quantity_purchased, unit, package_price, calories, protein, carbs, fat, fiber)
VALUES
  ('Piept de pui',          NULL,        'protein',     1000, 'g',   27.99, 120, 23,   0,    2.6, 0),
  ('Oua M',                 NULL,        'protein',       10, 'buc', 12.49, 143, 12.6, 0.7,  9.5, 0),
  ('Lapte 1.5%',            'Pilos',     'dairy',       1000, 'ml',   6.49,  46, 3.4,  4.8,  1.5, 0),
  ('Iaurt grecesc 2%',      'Pilos',     'dairy',        400, 'g',    7.99,  73, 9,    3.8,  2,   0),
  ('Branza cottage',        'Milbona',   'dairy',        200, 'g',    5.99,  98, 11,   3.4,  4.3, 0),
  ('Orez basmati',          'Golden Sun','grains',      1000, 'g',   11.99, 351, 8.1, 77,   0.9, 1.4),
  ('Fulgi de ovaz',         'Crownfield','grains',       500, 'g',    4.49, 372, 13.5, 58.7, 7,  10),
  ('Paste penne',           'Combino',   'bread_pasta',  500, 'g',    3.99, 359, 12.5, 71,   1.5, 3),
  ('Broccoli',              NULL,        'vegetables',   500, 'g',    7.99,  34, 2.8,  7,    0.4, 2.6),
  ('Banane',                NULL,        'fruits',      1000, 'g',    6.99,  89, 1.1,  22.8, 0.3, 2.6),
  ('Ulei de masline extravirgin', 'Primadonna', 'fats',  750, 'ml',  39.99, 884, 0,    0,  100,   0),
  ('Naut conserva',         'Freshona',  'legumes',      400, 'g',    3.49, 119, 7,   13,    2.4, 5);
