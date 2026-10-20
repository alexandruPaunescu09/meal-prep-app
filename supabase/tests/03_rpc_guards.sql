-- pgTAP tests (run with `npm run test:db` = `supabase test db`).
-- Everything runs inside one transaction that is rolled back, so no data is left behind
-- and the file works on a fresh migrate + seed as well as on a populated local stack.
-- Fixtures: admin 9999..., customer A 1111... -> client A (c...0a), customer B 2222... -> client B (c...0b).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'h5-admin@test.invalid', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'h5-user-a@test.invalid', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'h5-user-b@test.invalid', '{}', '{}', now(), now());

insert into clients (id, name, email) values
  ('c0000000-0000-4000-8000-00000000000a', 'H5 Client A', 'h5-client-a@test.invalid'),
  ('c0000000-0000-4000-8000-00000000000b', 'H5 Client B', 'h5-client-b@test.invalid');

insert into profiles (id, role, client_id) values
  ('99999999-9999-4999-8999-999999999999', 'admin', null),
  ('11111111-1111-4111-8111-111111111111', 'customer', 'c0000000-0000-4000-8000-00000000000a'),
  ('22222222-2222-4222-8222-222222222222', 'customer', 'c0000000-0000-4000-8000-00000000000b');

insert into ingredients (id, name, category, quantity_purchased, unit, package_price)
values ('d0000000-0000-4000-8000-000000000001', 'H5 Flour', 'other', 1000, 'g', 12.5);

insert into recipes (id, name, portions, notes, customer_description)
values ('e0000000-0000-4000-8000-000000000001', 'H5 Bread', 2, 'H5 SECRET NOTES', 'public text');
insert into recipe_ingredients (recipe_id, ingredient_id, quantity)
values ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 200);

insert into meal_plans (id, name, client_id, week_start) values
  ('f0000000-0000-4000-8000-00000000000a', 'H5 Plan A', 'c0000000-0000-4000-8000-00000000000a', '2030-01-07'),
  ('f0000000-0000-4000-8000-00000000000b', 'H5 Plan B', 'c0000000-0000-4000-8000-00000000000b', '2030-01-07');
insert into meal_plan_entries (id, meal_plan_id, day_of_week, meal_type, recipe_id, portions) values
  ('10000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-00000000000a', 1, 'lunch', 'e0000000-0000-4000-8000-000000000001', 1),
  ('10000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-00000000000b', 1, 'lunch', 'e0000000-0000-4000-8000-000000000001', 1),
  ('10000000-0000-4000-8000-0000000000a2', 'f0000000-0000-4000-8000-00000000000a', 2, 'lunch', 'e0000000-0000-4000-8000-000000000001', 1);

insert into meal_entry_status (meal_plan_entry_id, client_id, status) values
  ('10000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', 'eaten'),
  ('10000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', 'skipped');

insert into meal_reviews (id, meal_plan_entry_id, client_id, recipe_id, rating) values
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-000000000001', 5),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-000000000001', 2);

insert into foods (id, name, source, status, created_by_client_id) values
  ('30000000-0000-4000-8000-000000000001', 'H5 Active food', 'admin', 'active', null),
  ('30000000-0000-4000-8000-000000000002', 'H5 Pending of A', 'label_photo', 'pending', 'c0000000-0000-4000-8000-00000000000a'),
  ('30000000-0000-4000-8000-000000000003', 'H5 Pending of B', 'label_photo', 'pending', 'c0000000-0000-4000-8000-00000000000b'),
  ('30000000-0000-4000-8000-000000000004', 'H5 Hidden food', 'admin', 'hidden', null);

insert into food_log_entries (id, client_id, log_date, meal_type, source_kind, quantity, quantity_unit, name, calories) values
  ('40000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', '2030-01-07', 'snack', 'quick', 1, 'serving', 'H5 A snack', 100),
  ('40000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', '2030-01-07', 'snack', 'quick', 1, 'serving', 'H5 B snack', 200);

insert into weight_logs (id, client_id, log_date, weight_kg) values
  ('50000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', '2030-01-07', 70),
  ('50000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', '2030-01-07', 80);

-- ===== RPC guards: customers must not run admin RPCs =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$select merge_foods('30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001')$$, null, 'forbidden', 'customer cannot merge_foods');
select throws_ok($$select apply_invoice_prices('{"store":"x","invoice_date":"2030-01-07","total":1}'::jsonb, '[]'::jsonb)$$, null, 'forbidden', 'customer cannot apply_invoice_prices');
select throws_ok($$select save_recipe(null, '{"name":"x"}'::jsonb, '[{"ingredient_id":"d0000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb)$$, null, 'forbidden', 'customer cannot save_recipe');
select throws_ok($$select duplicate_meal_plan('f0000000-0000-4000-8000-00000000000b', 'copy', 'c0000000-0000-4000-8000-00000000000a', '2030-01-14', 2.5)$$, null, 'forbidden', 'customer cannot duplicate_meal_plan');
select throws_ok($$select clone_week('2030-01-07', '2030-01-14')$$, null, 'forbidden', 'customer cannot clone_week');
select throws_ok($$select log_container_delivery('c0000000-0000-4000-8000-00000000000a', null, '2030-01-07', null, '[]'::jsonb)$$, null, 'forbidden', 'customer cannot log_container_delivery');
select throws_ok($$select regenerate_prep_tasks('2030-01-07', '[]'::jsonb)$$, null, 'forbidden', 'customer cannot regenerate_prep_tasks');
reset role;
select is((select count(*)::int from foods where id = '30000000-0000-4000-8000-000000000002'), 1, 'foods unchanged after refused merge');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select merge_foods('30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001')$$, null, 'forbidden', 'anon blocked by is_admin guard: merge_foods');
select throws_ok($$select apply_invoice_prices('{}'::jsonb, '[]'::jsonb)$$, null, 'forbidden', 'anon blocked by is_admin guard: apply_invoice_prices');
select throws_ok($$select save_recipe(null, '{}'::jsonb, '[]'::jsonb)$$, null, 'forbidden', 'anon blocked by is_admin guard: save_recipe');
select throws_ok($$select duplicate_meal_plan(null, 'x', null, '2030-01-14', 2.5)$$, null, 'forbidden', 'anon blocked by is_admin guard: duplicate_meal_plan');
select throws_ok($$select clone_week('2030-01-07', '2030-01-14')$$, null, 'forbidden', 'anon blocked by is_admin guard: clone_week');

-- ===== admin positive path =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select lives_ok($$select merge_foods('30000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001')$$, 'admin can merge_foods');
select is((select count(*)::int from foods where id = '30000000-0000-4000-8000-000000000002'), 0, 'merged-away food is deleted');
select is((select count(*)::int from foods where id = '30000000-0000-4000-8000-000000000001'), 1, 'merge target survives');
select lives_ok($$select save_recipe(null, '{"name":"H5 admin recipe"}'::jsonb, '[{"ingredient_id":"d0000000-0000-4000-8000-000000000001","quantity":5}]'::jsonb)$$, 'admin can save_recipe');

reset role;
select * from finish();
rollback;
