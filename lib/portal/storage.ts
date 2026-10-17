import { createClient } from "@/lib/supabase/client";

const BUCKET = "meal-review-photos";

/** Max size of the ORIGINAL file we accept (it is compressed to well under 1 MB before upload). */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** Returns a human-readable problem, or null if the file looks usable. */
export function validatePhotoFile(file: File): string | null {
  if (file.type && !file.type.startsWith("image/")) {
    return "That file is not an image. Please choose a photo (JPG, PNG or WebP).";
  }
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    return "HEIC photos aren't supported by this browser. Please pick a JPG or PNG, or set your camera to 'Most Compatible'.";
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return "That photo is too large (max 15 MB). Please choose a smaller one.";
  }
  return null;
}

/**
 * Compresses an image File to <=1200px on the long side, JPEG @ 0.8.
 * Browser-only. Throws a user-readable Error if the image cannot be decoded.
 */
export async function compressImage(file: File, maxDim = 1200, quality = 0.8): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image format can't be read by your browser. Try a JPG or PNG.");
  }
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
