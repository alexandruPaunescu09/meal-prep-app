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

-- ===== food_log_entries =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from food_log_entries), 1, 'A sees exactly own diary rows');
select is((select count(*)::int from food_log_entries where client_id = 'c0000000-0000-4000-8000-00000000000b'), 0, 'A sees none of B''s diary rows');
select lives_ok($$insert into food_log_entries (client_id, log_date, meal_type, source_kind, quantity, quantity_unit, name) values ('c0000000-0000-4000-8000-00000000000a', '2030-01-08', 'snack', 'quick', 1, 'serving', 'A new')$$, 'A can insert own diary row');
select throws_ok($$insert into food_log_entries (client_id, log_date, meal_type, source_kind, quantity, quantity_unit, name) values ('c0000000-0000-4000-8000-00000000000b', '2030-01-08', 'snack', 'quick', 1, 'serving', 'spoof')$$, '42501', null, 'A cannot insert a diary row for B');
select throws_ok($$update food_log_entries set client_id = 'c0000000-0000-4000-8000-00000000000b' where id = '40000000-0000-4000-8000-00000000000a'$$, '42501', null, 'A cannot reassign own diary row to B');
update food_log_entries set name = 'HACKED' where id = '40000000-0000-4000-8000-00000000000b';
delete from food_log_entries where id = '40000000-0000-4000-8000-00000000000b';
reset role;
select is((select name from food_log_entries where id = '40000000-0000-4000-8000-00000000000b'), 'H5 B snack', 'A could not update or delete B''s diary row');
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from food_log_entries), 1, 'B sees exactly own diary rows (A''s new row hidden)');
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select cmp_ok((select count(*)::int from food_log_entries where client_id in ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000b')), '>=', 3, 'admin can SELECT all diary rows');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from food_log_entries), 0, 'anon sees no diary rows');

-- ===== foods =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select results_eq($$select name from foods where name like 'H5 %' order by name$$, $$values ('H5 Active food'), ('H5 Pending of A')$$, 'A sees active foods and own pending only');
select throws_ok($$insert into foods (name, source, status, created_by_client_id) values ('H5 cust', 'label_photo', 'pending', 'c0000000-0000-4000-8000-00000000000a')$$, '42501', null, 'customer cannot insert foods');
update foods set name = 'HACKED' where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002');
delete from foods where id in ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002');
reset role;
select is((select count(*)::int from foods where name in ('H5 Active food', 'H5 Pending of A')), 2, 'customer could not update or delete foods');
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select results_eq($$select name from foods where name like 'H5 %' order by name$$, $$values ('H5 Active food'), ('H5 Pending of B')$$, 'B sees active foods and own pending, NOT A''s pending');
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select is((select count(*)::int from foods where name like 'H5 %'), 4, 'admin sees every food incl. pending and hidden');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from foods), 0, 'anon sees no foods');

-- ===== weight_logs =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from weight_logs), 1, 'A sees only own weight logs');
select lives_ok($$insert into weight_logs (client_id, log_date, weight_kg) values ('c0000000-0000-4000-8000-00000000000a', '2030-01-08', 69)$$, 'A can insert own weight log');
select throws_ok($$insert into weight_logs (client_id, log_date, weight_kg) values ('c0000000-0000-4000-8000-00000000000b', '2030-01-09', 69)$$, '42501', null, 'A cannot insert a weight log for B');
update weight_logs set weight_kg = 20 where id = '50000000-0000-4000-8000-00000000000b';
delete from weight_logs where id = '50000000-0000-4000-8000-00000000000b';
reset role;
select is((select weight_kg from weight_logs where id = '50000000-0000-4000-8000-00000000000b'), 80::numeric, 'A could not update or delete B''s weight log');
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select cmp_ok((select count(*)::int from weight_logs where client_id in ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000b')), '>=', 3, 'admin can read all weight logs');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from weight_logs), 0, 'anon sees no weight logs');

reset role;
select * from finish();
rollback;
