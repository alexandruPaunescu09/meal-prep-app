-- Remove category from recipes (no longer classifying recipes by meal time)
ALTER TABLE recipes DROP COLUMN category;
