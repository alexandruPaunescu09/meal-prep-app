-- SE-1: "Spices & Herbs" ingredient category. Optional organisation aid and the
-- trigger for pre-ticking "Usually a seasoning"; the seasoning feature never reads it.
INSERT INTO ingredient_categories (slug, name, sort_order)
VALUES ('spices_herbs', 'Spices & Herbs', 13)
ON CONFLICT (slug) DO NOTHING;
