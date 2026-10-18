-- FD-4: scanned barcodes are looked up in ingredients too (foods.barcode is already UNIQUE).
CREATE INDEX IF NOT EXISTS idx_ingredients_barcode ON ingredients (barcode);
