-- SE-0: recipe seasonings (role + to_taste on recipe_ingredients, ingredients.is_seasoning,
-- save_recipe validation, customer read / no write, public views stay price-free). Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'se-admin@test.invalid', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'se-user@test.invalid', '{}', '{}', now(), now());
insert into clients (id, name, email) values
  ('c0000000-0000-4000-8000-00000000000a', 'SE Client', 'se-client@test.invalid');
insert into profiles (id, role, client_id) values
  ('99999999-9999-4999-8999-999999999999', 'admin', null),
  ('11111111-1111-4111-8111-111111111111', 'customer', 'c0000000-0000-4000-8000-00000000000a');
insert into ingredients (id, name, category, quantity_purchased, unit, package_price) values
  ('d2000000-0000-4000-8000-000000000001', 'SE Chicken', 'other', 1000, 'g', 30),
  ('d2000000-0000-4000-8000-000000000002', 'SE Salt', 'other', 1000, 'g', 2);
insert into recipes (id, name, portions) values
  ('e2000000-0000-4000-8000-000000000001', 'SE Fixture', 1);
insert into recipe_ingredients (recipe_id, ingredient_id, quantity) values
  ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 200);

-- ===== schema =====
select has_column('public', 'recipe_ingredients', 'role', 'recipe_ingredients.role exists');
select has_column('public', 'recipe_ingredients', 'to_taste', 'recipe_ingredients.to_taste exists');
select has_column('public', 'ingredients', 'is_seasoning', 'ingredients.is_seasoning exists');
select is((select role from recipe_ingredients where recipe_id = 'e2000000-0000-4000-8000-000000000001'), 'main', 'a line inserted without role defaults to main');
select is((select to_taste from recipe_ingredients where recipe_id = 'e2000000-0000-4000-8000-000000000001'), false, 'a line inserted without to_taste defaults to false');
select is((select is_seasoning from ingredients where id = 'd2000000-0000-4000-8000-000000000002'), false, 'is_seasoning defaults to false');

-- table CHECKs (superuser, no RLS in the way)
select throws_ok($$insert into recipe_ingredients (recipe_id, ingredient_id, quantity, role, to_taste) values ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 0, 'main', true)$$, '23514', null, 'CHECK rejects to_taste with role main');
select throws_ok($$insert into recipe_ingredients (recipe_id, ingredient_id, quantity, role, to_taste) values ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 3, 'seasoning', true)$$, '23514', null, 'CHECK rejects to_taste with quantity > 0');
select throws_ok($$insert into recipe_ingredients (recipe_id, ingredient_id, quantity, role) values ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 3, 'sauce')$$, '23514', null, 'CHECK rejects an unknown role');
select lives_ok($$insert into recipe_ingredients (recipe_id, ingredient_id, quantity, role, to_taste) values ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 0, 'seasoning', true)$$, 'a to-taste seasoning with quantity 0 is allowed');
delete from recipe_ingredients where recipe_id = 'e2000000-0000-4000-8000-000000000001' and to_taste;

-- public views stay free of the new ingredient flag and of prices
select hasnt_column('public', 'ingredients_public', 'is_seasoning', 'ingredients_public does not expose is_seasoning');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name in ('ingredients_public', 'recipes_public') and column_name in ('is_seasoning', 'package_price', 'price_per_unit', 'quantity_purchased', 'notes')), 0, 'no seasoning flag or price column in either public view');

-- ===== customer: reads both columns, cannot write =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$select role, to_taste from recipe_ingredients$$, 'customer can select role and to_taste');
select is((select count(*)::int from recipe_ingredients where recipe_id = 'e2000000-0000-4000-8000-000000000001'), 1, 'customer reads the recipe line');
select throws_ok($$insert into recipe_ingredients (recipe_id, ingredient_id, quantity, role) values ('e2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002', 5, 'seasoning')$$, '42501', null, 'customer cannot insert a recipe line');
update recipe_ingredients set role = 'seasoning' where recipe_id = 'e2000000-0000-4000-8000-000000000001';
select is((select role from recipe_ingredients where recipe_id = 'e2000000-0000-4000-8000-000000000001'), 'main', 'customer update changed nothing');
delete from recipe_ingredients where recipe_id = 'e2000000-0000-4000-8000-000000000001';
select is((select count(*)::int from recipe_ingredients where recipe_id = 'e2000000-0000-4000-8000-000000000001'), 1, 'customer delete removed nothing');
select throws_ok($$select save_recipe(null, '{"name":"SE Customer"}'::jsonb, '[{"ingredient_id":"d2000000-0000-4000-8000-000000000001","quantity":1,"role":"main","to_taste":false}]'::jsonb)$$, null, 'forbidden', 'customer save_recipe raises forbidden');
reset role;

-- ===== anon =====
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from recipe_ingredients), 0, 'anon sees no recipe lines');
select throws_ok($$select save_recipe(null, '{"name":"SE Anon"}'::jsonb, '[{"ingredient_id":"d2000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb)$$, null, 'forbidden', 'anon save_recipe raises forbidden');
reset role;
select is((select count(*)::int from recipes where name in ('SE Customer', 'SE Anon')), 0, 'refused calls wrote nothing');

-- ===== admin: save_recipe =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';

create temp table se_ids (name text primary key, id uuid);
grant all on se_ids to authenticated;
insert into se_ids select 'seasoned', save_recipe(null, '{"name":"SE Seasoned","portions":2}'::jsonb,
  '[{"ingredient_id":"d2000000-0000-4000-8000-000000000001","quantity":200,"role":"main","to_taste":false},
    {"ingredient_id":"d2000000-0000-4000-8000-000000000002","quantity":0,"role":"seasoning","to_taste":true}]'::jsonb);
select is((select count(*)::int from recipe_ingredients where recipe_id = (select id from se_ids where name = 'seasoned')), 2, 'two lines saved');
select is((select to_taste from recipe_ingredients where recipe_id = (select id from se_ids where name = 'seasoned') and ingredient_id = 'd2000000-0000-4000-8000-000000000002'), true, 'to_taste saved');
select is((select role from recipe_ingredients where recipe_id = (select id from se_ids where name = 'seasoned') and ingredient_id = 'd2000000-0000-4000-8000-000000000002'), 'seasoning', 'role saved');
select is((select quantity from recipe_ingredients where recipe_id = (select id from se_ids where name = 'seasoned') and ingredient_id = 'd2000000-0000-4000-8000-000000000002'), 0::numeric, 'to-taste line stores quantity 0');

-- round trip: re-saving the same lines keeps role and to_taste
select lives_ok($$select save_recipe((select id from se_ids where name = 'seasoned'), '{"name":"SE Seasoned","portions":2}'::jsonb,
  '[{"ingredient_id":"d2000000-0000-4000-8000-000000000001","quantity":250,"role":"main","to_taste":false},
    {"ingredient_id":"d2000000-0000-4000-8000-000000000002","quantity":0,"role":"seasoning","to_taste":true}]'::jsonb)$$, 'update with the same roles works');
select is((select role || ':' || to_taste::text from recipe_ingredients where recipe_id = (select id from se_ids where name = 'seasoned') and ingredient_id = 'd2000000-0000-4000-8000-000000000002'), 'seasoning:true', 'role and to_taste kept on re-save');
select is((select quantity from recipe_ingredients where recipe_id = (select id from se_ids where name = 'seasoned') and ingredient_id = 'd2000000-0000-4000-8000-000000000001'), 250::numeric, 'main quantity updated');

-- a weighed seasoning is fine
select lives_ok($$select save_recipe(null, '{"name":"SE Weighed"}'::jsonb,
  '[{"ingredient_id":"d2000000-0000-4000-8000-000000000001","quantity":100,"role":"main","to_taste":false},
    {"ingredient_id":"d2000000-0000-4000-8000-000000000002","quantity":3,"role":"seasoning","to_taste":false}]'::jsonb)$$, 'weighed seasoning saves');

-- lines sent without role / to_taste save as main / false
insert into se_ids select 'legacy', save_recipe(null, '{"name":"SE Legacy"}'::jsonb,
  '[{"ingredient_id":"d2000000-0000-4000-8000-000000000001","quantity":100},{"ingredient_id":"d2000000-0000-4000-8000-000000000002","quantity":2,"role":"","to_taste":null}]'::jsonb);
select is((select count(*)::int from recipe_ingredients where recipe_id = (select id from se_ids where name = 'legacy') and role = 'main' and to_taste = false), 2, 'missing, empty and null role/to_taste save as main / false');

-- rejections
select throws_ok($$select save_recipe(null, '{"name":"SE Bad"}'::jsonb, '[{"ingredient_id":"d2000000-0000-4000-8000-000000000001","quantity":5,"role":"sauce","to_taste":false}]'::jsonb)$$, null, null, 'bad role is rejected');
select throws_ok($$select save_recipe(null, '{"name":"SE Bad"}'::jsonb, '[{"ingredient_id":"d2000000-0000-4000-8000-000000000001","quantity":0,"role":"seasoning","to_taste":false}]'::jsonb)$$, null, null, 'a non-to-taste line with quantity 0 is rejected');
select throws_ok($$select save_recipe(null, '{"name":"SE Bad"}'::jsonb, '[{"ingredient_id":"d2000000-0000-4000-8000-000000000001","quantity":0,"role":"main","to_taste":false}]'::jsonb)$$, null, null, 'a main line with quantity 0 is rejected');
select throws_ok($$select save_recipe(null, '{"name":"SE Bad"}'::jsonb, '[{"ingredient_id":"d2000000-0000-4000-8000-000000000002","quantity":5,"role":"seasoning","to_taste":true}]'::jsonb)$$, null, null, 'a to-taste line with quantity > 0 is rejected');
select throws_ok($$select save_recipe(null, '{"name":"SE Bad"}'::jsonb, '[{"ingredient_id":"d2000000-0000-4000-8000-000000000002","quantity":0,"role":"main","to_taste":true}]'::jsonb)$$, null, null, 'a to-taste line with role main is rejected');
select throws_ok($$select save_recipe(null, '{"name":"SE Bad"}'::jsonb, '[{"ingredient_id":"d2000000-0000-4000-8000-000000000002","role":"seasoning","to_taste":true}]'::jsonb)$$, null, null, 'a to-taste line without a quantity is rejected');
reset role;
select is((select count(*)::int from recipes where name = 'SE Bad'), 0, 'rejected saves left no recipe behind');

-- save_imported_recipe forwards role / to_taste through save_recipe
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select lives_ok($$select save_imported_recipe('{"name":"SE Imported"}'::jsonb,
  '[{"ingredient_id":"d2000000-0000-4000-8000-000000000001","quantity":100,"role":"main","to_taste":false},{"ingredient_id":"d2000000-0000-4000-8000-000000000002","quantity":0,"role":"seasoning","to_taste":true}]'::jsonb, '[]'::jsonb)$$, 'save_imported_recipe accepts a to-taste seasoning line');
select is((select count(*)::int from recipe_ingredients ri join recipes r on r.id = ri.recipe_id where r.name = 'SE Imported' and ri.to_taste and ri.role = 'seasoning'), 1, 'imported to-taste line kept');
reset role;

select * from finish();
rollback;
