-- RI-0c: price pending. ingredients.package_price is nullable (NULL = price pending),
-- apply_invoice_prices treats a NULL stored price as "no old price" (no bogus history row),
-- and the customer views still expose no price columns.
-- Rolled back, so no data is left behind.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999', 'authenticated', 'authenticated', 'pp-admin@test.invalid', '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'pp-user@test.invalid', '{}', '{}', now(), now());
insert into clients (id, name, email) values
  ('c0000000-0000-4000-8000-00000000000a', 'PP Client', 'pp-client@test.invalid');
insert into profiles (id, role, client_id) values
  ('99999999-9999-4999-8999-999999999999', 'admin', null),
  ('11111111-1111-4111-8111-111111111111', 'customer', 'c0000000-0000-4000-8000-00000000000a');

-- ===== schema =====
select col_is_null('public', 'ingredients', 'package_price', 'ingredients.package_price is nullable');
select col_not_null('public', 'ingredients', 'quantity_purchased', 'quantity_purchased stays NOT NULL');

-- ===== admin can store a price-pending ingredient =====
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-4999-8999-999999999999","role":"authenticated"}';
select lives_ok($$insert into ingredients (id, name, category, quantity_purchased, unit, package_price) values ('d0000000-0000-4000-8000-0000000000a1', 'PP Pending', 'other', 1000, 'g', null)$$, 'admin can insert an ingredient with NULL package_price');
select is((select price_per_unit from ingredients where id = 'd0000000-0000-4000-8000-0000000000a1'), null::numeric, 'generated price_per_unit is NULL with it');
select lives_ok($$insert into ingredients (id, name, category, quantity_purchased, unit, package_price) values ('d0000000-0000-4000-8000-0000000000b1', 'PP Priced', 'other', 1000, 'g', 10)$$, 'admin can insert a priced ingredient');
select throws_ok($$insert into ingredients (name, category, quantity_purchased, unit, package_price) values ('PP no qty', 'other', null, 'g', 5)$$, '23502', null, 'quantity_purchased NULL is still rejected');

-- ===== apply_invoice_prices on a NULL-price ingredient =====
select is(
  apply_invoice_prices(
    '{"store":"pp-store","invoice_date":"2030-01-07","total":1}'::jsonb,
    '[{"ingredient_id":"d0000000-0000-4000-8000-0000000000a1","package_price":12,"quantity_purchased":500,"raw_name":"pp pending raw"}]'::jsonb
  ) - 'invoice_id',
  '{"updated": 1, "unchanged": 0}'::jsonb,
  'filling a pending price counts as updated'
);
select is((select package_price from ingredients where id = 'd0000000-0000-4000-8000-0000000000a1'), 12::numeric, 'pending ingredient got its price');
select is((select quantity_purchased from ingredients where id = 'd0000000-0000-4000-8000-0000000000a1'), 500::numeric, 'and its package size');
select is((select price_per_unit from ingredients where id = 'd0000000-0000-4000-8000-0000000000a1'), 0.024::numeric, 'price_per_unit is generated again');
select is((select count(*)::int from ingredient_price_history where ingredient_id = 'd0000000-0000-4000-8000-0000000000a1'), 0, 'no price history row for a NULL old price (no bogus 0)');
select is((select count(*)::int from ingredient_aliases where ingredient_id = 'd0000000-0000-4000-8000-0000000000a1' and store = 'pp-store'), 1, 'alias still recorded');

-- a second import of the now-priced ingredient logs the old price as before
select is(
  apply_invoice_prices(
    '{"store":"pp-store","invoice_date":"2030-01-08","total":1}'::jsonb,
    '[{"ingredient_id":"d0000000-0000-4000-8000-0000000000a1","package_price":15,"quantity_purchased":500,"raw_name":"pp pending raw"}]'::jsonb
  ) - 'invoice_id',
  '{"updated": 1, "unchanged": 0}'::jsonb,
  'changing a real price counts as updated'
);
select is((select price_per_unit from ingredient_price_history where ingredient_id = 'd0000000-0000-4000-8000-0000000000a1'), 0.024::numeric, 'history row holds the old per-unit price');

-- an already-priced ingredient still logs history on a price change
select lives_ok($$select apply_invoice_prices('{"store":"pp-store","invoice_date":"2030-01-09","total":1}'::jsonb, '[{"ingredient_id":"d0000000-0000-4000-8000-0000000000b1","package_price":20,"quantity_purchased":1000,"raw_name":"pp priced raw"}]'::jsonb)$$, 'priced ingredient import runs');
select is((select count(*)::int from ingredient_price_history where ingredient_id = 'd0000000-0000-4000-8000-0000000000b1'), 1, 'priced ingredient logs one history row');
select is((select price_per_unit from ingredient_price_history where ingredient_id = 'd0000000-0000-4000-8000-0000000000b1'), 0.01::numeric, 'with its old per-unit price');

-- validation is unchanged
select throws_ok($$select apply_invoice_prices('{"store":"pp-store"}'::jsonb, '[{"ingredient_id":"d0000000-0000-4000-8000-0000000000a1","package_price":0,"quantity_purchased":500}]'::jsonb)$$, null, null, 'a new price of 0 is still rejected');

-- ===== customers: guard + views stay price-free =====
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$select apply_invoice_prices('{"store":"x"}'::jsonb, '[]'::jsonb)$$, null, 'forbidden', 'customer still cannot apply_invoice_prices');
select hasnt_column('public', 'ingredients_public', 'package_price', 'ingredients_public hides package_price');
select hasnt_column('public', 'ingredients_public', 'price_per_unit', 'ingredients_public hides price_per_unit');
select is((select count(*)::int from ingredients_public where id = 'd0000000-0000-4000-8000-0000000000b1'), 1, 'customer can read the ingredient through the view');
select throws_ok($$select package_price from ingredients_public$$, '42703', null, 'customer cannot select package_price through the view');
select is((select count(*)::int from ingredients where id = 'd0000000-0000-4000-8000-0000000000b1'), 0, 'customer cannot read the base table');

reset role;
select * from finish();
rollback;
