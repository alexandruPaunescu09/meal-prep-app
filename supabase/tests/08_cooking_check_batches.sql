-- Cooked check-offs are per cook batch: (week_start, recipe_id, first_day), first_day in 1,3,5.
-- Rolled back, so no data is left behind.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999998', 'authenticated', 'authenticated', 'cb-admin@test.invalid', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111112', 'authenticated', 'authenticated', 'cb-user@test.invalid', '{}', '{}', now(), now());
insert into clients (id, name, email) values
  ('c0000000-0000-4000-8000-0000000000cb', 'CB Client', 'cb-client@test.invalid');
insert into profiles (id, role, client_id) values
  ('99999999-9999-4999-8999-999999999998', 'admin', null),
  ('11111111-1111-4111-8111-111111111112', 'customer', 'c0000000-0000-4000-8000-0000000000cb');
insert into recipes (id, name, portions) values
  ('e0000000-0000-4000-8000-0000000000cb', 'CB Recipe', 2);

-- ===== schema =====
select col_not_null('public', 'cooking_check_state', 'first_day', 'first_day is NOT NULL');
select col_is_pk('public', 'cooking_check_state', array['week_start', 'recipe_id', 'first_day'], 'PK is (week_start, recipe_id, first_day)');

-- ===== admin =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999998","role":"authenticated"}';
select lives_ok($$insert into cooking_check_state (week_start, recipe_id, first_day) values ('2030-01-07', 'e0000000-0000-4000-8000-0000000000cb', 1)$$, 'admin can check a recipe in batch 1');
select lives_ok($$insert into cooking_check_state (week_start, recipe_id, first_day) values ('2030-01-07', 'e0000000-0000-4000-8000-0000000000cb', 3)$$, 'same recipe, same week, another batch is allowed');
select throws_ok($$insert into cooking_check_state (week_start, recipe_id, first_day) values ('2030-01-07', 'e0000000-0000-4000-8000-0000000000cb', 1)$$, '23505', null, 'duplicate (week, recipe, first_day) rejected');
select throws_ok($$insert into cooking_check_state (week_start, recipe_id, first_day) values ('2030-01-07', 'e0000000-0000-4000-8000-0000000000cb', 2)$$, '23514', null, 'first_day = 2 rejected');
select throws_ok($$insert into cooking_check_state (week_start, recipe_id, first_day) values ('2030-01-07', 'e0000000-0000-4000-8000-0000000000cb', 7)$$, '23514', null, 'first_day = 7 (Sunday) rejected');
select throws_ok($$insert into cooking_check_state (week_start, recipe_id, first_day) values ('2030-01-07', 'e0000000-0000-4000-8000-0000000000cb', null)$$, '23502', null, 'first_day NULL rejected');
select is((select count(*)::int from cooking_check_state where week_start = '2030-01-07'), 2, 'admin sees both batch rows');
select lives_ok($$delete from cooking_check_state where week_start = '2030-01-07' and first_day = 3$$, 'admin can delete one batch row');
select is((select count(*)::int from cooking_check_state where week_start = '2030-01-07'), 1, 'only the other batch row is left');

-- ===== customer =====
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111112","role":"authenticated"}';
select is((select count(*)::int from cooking_check_state), 0, 'customer reads 0 rows');
select throws_ok($$insert into cooking_check_state (week_start, recipe_id, first_day) values ('2030-01-07', 'e0000000-0000-4000-8000-0000000000cb', 5)$$, '42501', null, 'customer cannot insert');

-- ===== anon =====
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*)::int from cooking_check_state), 0, 'anon reads 0 rows');
select throws_ok($$insert into cooking_check_state (week_start, recipe_id, first_day) values ('2030-01-07', 'e0000000-0000-4000-8000-0000000000cb', 5)$$, '42501', null, 'anon cannot insert');

select * from finish();
rollback;
