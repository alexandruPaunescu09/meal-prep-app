import { createClient } from "@/lib/supabase/client";

const BUCKET = "meal-review-photos";

/**
 * Compresses an image File to <=1200px on the long side, JPEG @ 0.8.
 * Browser-only.
 */
export async function compressImage(file: File, maxDim = 1200, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      quality
    );
  });
}

export async function uploadReviewPhoto(opts: {
  clientId: string;
  reviewId: string;
  file: File;
}): Promise<string> {
  const supabase = createClient();
  const blob = await compressImage(opts.file);
  const path = `${opts.clientId}/${opts.reviewId}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

export async function getSignedReviewPhotoUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
