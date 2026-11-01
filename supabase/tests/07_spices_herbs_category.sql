-- SE-1: the "Spices & Herbs" category seed exists exactly once and re-running it is a no-op.
-- Rolled back, so no data is left behind.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select is((select count(*)::int from ingredient_categories where slug = 'spices_herbs'), 1, 'spices_herbs category exists exactly once');
select is((select name from ingredient_categories where slug = 'spices_herbs'), 'Spices & Herbs', 'name is "Spices & Herbs"');
select is((select sort_order from ingredient_categories where slug = 'spices_herbs'), 13, 'sort_order is 13');

select lives_ok($$insert into ingredient_categories (slug, name, sort_order) values ('spices_herbs', 'Spices & Herbs', 13) on conflict (slug) do nothing$$, 're-running the seed insert does not fail');
select is((select count(*)::int from ingredient_categories where slug = 'spices_herbs'), 1, 're-running the seed insert adds no second row');

select * from finish();
rollback;
