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

insert into ingredient_price_history (id, ingredient_id, package_price, quantity_purchased, unit, price_per_unit)
values ('60000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 10, 1000, 'g', 0.01);

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

insert into food_favorites (id, client_id, food_id) values
  ('70000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-000000000001');

-- a user with no profile (for the profile INSERT test)
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'h5-user-c@test.invalid', '{}', '{}', now(), now());

insert into weight_logs (id, client_id, log_date, weight_kg) values
  ('50000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000a', '2030-01-07', 70),
  ('50000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000b', '2030-01-07', 80);

-- ===== meal_entry_status =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from meal_entry_status), 1, 'A sees only own meal status');
select lives_ok($$insert into meal_entry_status (meal_plan_entry_id, client_id, status) values ('10000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-00000000000a', 'eaten')$$, 'A can set status on own plan entry');
select throws_ok($$insert into meal_entry_status (meal_plan_entry_id, client_id, status) values ('10000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-00000000000b', 'eaten')$$, '42501', null, 'A cannot write status as B');
update meal_entry_status set status = 'eaten' where meal_plan_entry_id = '10000000-0000-4000-8000-00000000000b';
delete from meal_entry_status where meal_plan_entry_id = '10000000-0000-4000-8000-00000000000b';
reset role;
select is((select status from meal_entry_status where meal_plan_entry_id = '10000000-0000-4000-8000-00000000000b'), 'skipped', 'A could not change or delete B''s status');
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select cmp_ok((select count(*)::int from meal_entry_status where client_id in ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-00000000000b')), '>=', 3, 'admin can read all statuses');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from meal_entry_status), 0, 'anon sees no statuses');

-- ===== meal_reviews =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from meal_reviews), 1, 'A sees only own reviews');
select throws_ok($$insert into meal_reviews (meal_plan_entry_id, client_id, rating) values ('10000000-0000-4000-8000-0000000000a2', 'c0000000-0000-4000-8000-00000000000b', 4)$$, '42501', null, 'A cannot write a review as B');
select lives_ok($$update meal_reviews set rating = 4 where id = '20000000-0000-4000-8000-00000000000a'$$, 'A can update own review');
update meal_reviews set rating = 1 where id = '20000000-0000-4000-8000-00000000000b';
delete from meal_reviews where id = '20000000-0000-4000-8000-00000000000b';
reset role;
select is((select rating from meal_reviews where id = '20000000-0000-4000-8000-00000000000b'), 2, 'A could not update or delete B''s review');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
delete from meal_reviews where id = '20000000-0000-4000-8000-00000000000a';
reset role;
select is((select count(*)::int from meal_reviews where id = '20000000-0000-4000-8000-00000000000a'), 0, '"Customer delete own": A can delete own review');
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select is((select count(*)::int from meal_reviews where id = '20000000-0000-4000-8000-00000000000b'), 1, 'admin can read B''s review');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from meal_reviews), 0, 'anon sees no reviews');

-- ===== ingredients / recipes base tables: no customer access =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from ingredients), 0, 'customer gets no rows from ingredients (prices hidden)');
select is((select count(*)::int from recipes), 0, 'customer gets no rows from recipes (notes hidden)');
select is((select count(*)::int from ingredient_price_history), 0, 'customer gets no price history (a fixture row exists)');
select throws_ok($$insert into ingredients (name, quantity_purchased, package_price) values ('x', 1, 1)$$, '42501', null, 'customer cannot insert ingredients');
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select is((select package_price from ingredients where id = 'd0000000-0000-4000-8000-000000000001'), 12.5::numeric, 'admin reads ingredient price');
select is((select notes from recipes where id = 'e0000000-0000-4000-8000-000000000001'), 'H5 SECRET NOTES', 'admin reads recipe notes');
select is((select count(*)::int from ingredient_price_history where id = '60000000-0000-4000-8000-000000000001'), 1, 'admin reads the price history row');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from ingredients), 0, 'anon sees no ingredients');
select is((select count(*)::int from recipes), 0, 'anon sees no recipes');

-- ===== public views =====
reset role;
select has_view('public', 'ingredients_public', 'ingredients_public exists');
select has_view('public', 'recipes_public', 'recipes_public exists');
select hasnt_column('public', 'ingredients_public', 'package_price', 'ingredients_public hides package_price');
select hasnt_column('public', 'ingredients_public', 'price_per_unit', 'ingredients_public hides price_per_unit');
select hasnt_column('public', 'ingredients_public', 'quantity_purchased', 'ingredients_public hides quantity_purchased');
select hasnt_column('public', 'recipes_public', 'notes', 'recipes_public hides notes');
select is((select count(*)::int from information_schema.columns where table_schema = 'public' and table_name in ('ingredients_public', 'recipes_public') and column_name in ('package_price', 'price_per_unit', 'quantity_purchased', 'notes')), 0, 'no confidential column in either view (information_schema)');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from ingredients_public where id = 'd0000000-0000-4000-8000-000000000001'), 1, 'customer can read ingredients_public');
select is((select count(*)::int from recipes_public where id = 'e0000000-0000-4000-8000-000000000001'), 1, 'customer can read recipes_public');
select throws_ok($$select package_price from ingredients_public$$, '42703', null, 'customer cannot select package_price through the view');
select throws_ok($$select notes from recipes_public$$, '42703', null, 'customer cannot select notes through the view');
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select is((select count(*)::int from ingredients_public where id = 'd0000000-0000-4000-8000-000000000001'), 1, 'admin can read ingredients_public');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select * from ingredients_public$$, '42501', null, 'anon cannot read ingredients_public');
select throws_ok($$select * from recipes_public$$, '42501', null, 'anon cannot read recipes_public');

-- ===== meal_plans / meal_plan_entries: customer reads own only, never writes =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from meal_plans where id = 'f0000000-0000-4000-8000-00000000000a'), 1, 'A reads own meal plan');
select is((select count(*)::int from meal_plans where id = 'f0000000-0000-4000-8000-00000000000b'), 0, 'A cannot read B''s meal plan');
select is((select count(*)::int from meal_plan_entries where meal_plan_id = 'f0000000-0000-4000-8000-00000000000a'), 2, 'A reads own plan entries');
select is((select count(*)::int from meal_plan_entries where meal_plan_id = 'f0000000-0000-4000-8000-00000000000b'), 0, 'A cannot read B''s plan entries');
update meal_plans set name = 'hacked' where id = 'f0000000-0000-4000-8000-00000000000a';
select throws_ok($$insert into meal_plans (name, client_id, week_start) values ('x', 'c0000000-0000-4000-8000-00000000000a', '2030-02-04')$$, '42501', null, 'customer cannot insert meal plans');
reset role;
select is((select name from meal_plans where id = 'f0000000-0000-4000-8000-00000000000a'), 'H5 Plan A', 'customer cannot update own meal plan');

-- ===== food_favorites: own rows only =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from food_favorites), 1, 'A sees only own favorites');
select is((select count(*)::int from food_favorites where id = '70000000-0000-4000-8000-00000000000b'), 0, 'A cannot read B''s favorite');
select throws_ok($$insert into food_favorites (client_id, recipe_id) values ('c0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-000000000001')$$, '42501', null, 'A cannot insert a favorite for B');
select lives_ok($$insert into food_favorites (client_id, recipe_id) values ('c0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-000000000001')$$, 'A can insert own favorite');
delete from food_favorites where id = '70000000-0000-4000-8000-00000000000b';
reset role;
select is((select count(*)::int from food_favorites where id = '70000000-0000-4000-8000-00000000000b'), 1, 'A could not delete B''s favorite');

-- ===== profiles: no self-promotion, no insert, no reading others =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from profiles), 1, 'A sees only own profile');
select is((select count(*)::int from profiles where id = '22222222-2222-4222-8222-222222222222'), 0, 'A cannot read B''s profile');
update profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111';
update profiles set client_id = 'c0000000-0000-4000-8000-00000000000b' where id = '11111111-1111-4111-8111-111111111111';
update profiles set role = 'admin' where id = '22222222-2222-4222-8222-222222222222';
select throws_ok($$insert into profiles (id, role) values ('33333333-3333-4333-8333-333333333333', 'admin')$$, '42501', null, 'customer cannot insert a profile');
reset role;
select is((select role from profiles where id = '11111111-1111-4111-8111-111111111111'), 'customer', 'A could not change own role');
select is((select client_id from profiles where id = '11111111-1111-4111-8111-111111111111'), 'c0000000-0000-4000-8000-00000000000a'::uuid, 'A could not re-link own profile to B');
select is((select role from profiles where id = '22222222-2222-4222-8222-222222222222'), 'customer', 'A could not change B''s role');
select is((select count(*)::int from profiles where id = '33333333-3333-4333-8333-333333333333'), 0, 'no profile was created for the third user');

-- ===== KNOWN HOLE: ownership of the target plan entry is not checked =====
-- The policies only compare client_id, so A can attach a status/review to B's plan entry
-- (under its own client_id). That then blocks B's own row for the slot (PK / UNIQUE entry id).
reset role;
delete from meal_entry_status where meal_plan_entry_id = '10000000-0000-4000-8000-00000000000b';
delete from meal_reviews where meal_plan_entry_id = '10000000-0000-4000-8000-00000000000b';
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select todo_start('KNOWN HOLE: meal_entry_status policy does not check the plan entry belongs to the customer');
select throws_ok($$insert into meal_entry_status (meal_plan_entry_id, client_id, status) values ('10000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000a', 'eaten')$$, '42501', null, 'A cannot set status on B''s plan entry');
select todo_end();
select todo_start('KNOWN HOLE: meal_reviews policy does not check the plan entry belongs to the customer');
select throws_ok($$insert into meal_reviews (meal_plan_entry_id, client_id, rating) values ('10000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-00000000000a', 1)$$, '42501', null, 'A cannot review B''s plan entry');
select todo_end();

reset role;
select * from finish();
rollback;
