-- RI-3: save_imported_recipe guard + atomicity tests. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'ri-admin@test.invalid', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'ri-user@test.invalid', '{}', '{}', now(), now());
insert into clients (id, name, email) values
  ('c0000000-0000-4000-8000-00000000000a', 'RI Client', 'ri-client@test.invalid');
insert into profiles (id, role, client_id) values
  ('99999999-9999-4999-8999-999999999999', 'admin', null),
  ('11111111-1111-4111-8111-111111111111', 'customer', 'c0000000-0000-4000-8000-00000000000a');
insert into ingredients (id, name, category, quantity_purchased, unit, package_price) values
  ('d1000000-0000-4000-8000-000000000001', 'RI Flour', 'other', 1000, 'g', 5),
  ('d1000000-0000-4000-8000-000000000002', 'RI Zucchini', 'other', 1000, 'g', 8);
insert into ingredient_aliases (ingredient_id, store, alias) values
  ('d1000000-0000-4000-8000-000000000001', 'recipe', 'faina veche');

-- ===== customer and anon =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$select save_imported_recipe('{"name":"x"}'::jsonb, '[{"ingredient_id":"d1000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb, '[]'::jsonb)$$, null, 'forbidden', 'customer cannot save_imported_recipe');
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select save_imported_recipe('{}'::jsonb, '[]'::jsonb, '[]'::jsonb)$$, null, 'forbidden', 'anon blocked by is_admin guard');
reset role;
select is((select count(*)::int from recipes where name = 'RI Imported'), 0, 'nothing written by refused calls');

-- ===== admin =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select lives_ok($$select save_imported_recipe('{"name":"RI Imported","portions":2,"source_url":"https://example.com/r","instructions":["Mix","Fry"]}'::jsonb, '[{"ingredient_id":"d1000000-0000-4000-8000-000000000001","quantity":200},{"ingredient_id":"d1000000-0000-4000-8000-000000000002","quantity":300}]'::jsonb, '[{"alias":"Dovlecei medii","ingredient_id":"d1000000-0000-4000-8000-000000000002"},{"alias":"faina veche","ingredient_id":"d1000000-0000-4000-8000-000000000002"}]'::jsonb)$$, 'admin can save_imported_recipe');
select is((select count(*)::int from recipes where name = 'RI Imported'), 1, 'recipe created');
select is((select source_url from recipes where name = 'RI Imported'), 'https://example.com/r', 'source_url stored');
select is((select instructions from recipes where name = 'RI Imported'), '["Mix","Fry"]'::jsonb, 'steps stored');
select is((select count(*)::int from recipe_ingredients ri join recipes r on r.id = ri.recipe_id where r.name = 'RI Imported'), 2, 'ingredient lines stored');
select is((select count(*)::int from ingredient_aliases where store = 'recipe' and lower(alias) = 'dovlecei medii'), 1, 'new alias stored with store recipe');
select is((select ingredient_id from ingredient_aliases where store = 'recipe' and lower(alias) = 'faina veche'), 'd1000000-0000-4000-8000-000000000002'::uuid, 'existing alias repointed');
select is((select count(*)::int from ingredient_aliases where store = 'recipe' and lower(alias) = 'faina veche'), 1, 'still one row for the repointed alias');

-- ===== atomicity: bad ingredient id rolls everything back =====
select throws_ok($$select save_imported_recipe('{"name":"RI Broken"}'::jsonb, '[{"ingredient_id":"d1000000-0000-4000-8000-000000000001","quantity":5},{"ingredient_id":"d1000000-0000-4000-8000-0000000000ff","quantity":5}]'::jsonb, '[{"alias":"broken alias","ingredient_id":"d1000000-0000-4000-8000-000000000001"}]'::jsonb)$$, '23503', null, 'unknown ingredient id fails');
select is((select count(*)::int from recipes where name = 'RI Broken'), 0, 'no recipe left behind');
select is((select count(*)::int from ingredient_aliases where lower(alias) = 'broken alias'), 0, 'no alias left behind');
select throws_ok($$select save_imported_recipe('{"name":"RI Broken2"}'::jsonb, '[{"ingredient_id":"d1000000-0000-4000-8000-000000000001","quantity":5}]'::jsonb, '[{"alias":"bad alias","ingredient_id":"d1000000-0000-4000-8000-0000000000ff"}]'::jsonb)$$, '23503', null, 'unknown alias target fails');
select is((select count(*)::int from recipes where name = 'RI Broken2'), 0, 'recipe rolled back when an alias fails');

select * from finish();
rollback;
