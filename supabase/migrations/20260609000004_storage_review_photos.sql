-- Private storage bucket for review photos.
-- Path convention: {client_id}/{review_id}.{ext}
-- Customers can read/write only inside their own client_id folder; admin reads all.

INSERT INTO storage.buckets (id, name, public)
VALUES ('meal-review-photos', 'meal-review-photos', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Customer policies: scoped to their client_id folder.
CREATE POLICY "Customer read own folder"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'meal-review-photos'
    AND current_client_id()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Customer upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'meal-review-photos'
    AND current_client_id()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Customer update own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'meal-review-photos'
    AND current_client_id()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Customer delete own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'meal-review-photos'
    AND current_client_id()::text = (storage.foldername(name))[1]
  );

-- Admin: full access to the bucket.
CREATE POLICY "Admin full access on review photos"
  ON storage.objects FOR ALL
  USING (bucket_id = 'meal-review-photos' AND is_admin())
  WITH CHECK (bucket_id = 'meal-review-photos' AND is_admin());
