"use client";

import { useEffect, useState } from "react";
import { Star, X, Camera } from "lucide-react";
import { Client, MealReview, Recipe, ReviewTag } from "@/lib/supabase/types";
import { getSignedReviewPhotoUrl } from "@/lib/portal/storage";

type FullReview = MealReview & { client?: Client; recipe?: Recipe };

export default function ReviewDetailModal({
  review,
  tags,
  onClose,
}: {
  review: FullReview;
  tags: ReviewTag[];
  onClose: () => void;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (review.photo_path) {
      getSignedReviewPhotoUrl(review.photo_path).then((url) => {
        if (!cancelled) setPhotoUrl(url);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [review.photo_path]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 pt-5 pb-3 border-b flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-0.5 font-bold text-amber-600">
                <Star className="w-5 h-5 fill-current" />
                {review.rating}
              </span>
              <h2 className="font-bold text-gray-900">
                {review.recipe?.name ?? "Deleted recipe"}
              </h2>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">
              {review.client?.name ?? "Unknown"} · {new Date(review.created_at).toLocaleDateString()}
            </p>
          </div>
          <button onClick={onClose} className="p-2 -m-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {review.comment && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1">Comment</h3>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{review.comment}</p>
            </div>
          )}

          {tags.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t.id}
                    className={`text-xs px-2 py-0.5 rounded ${
                      t.sentiment === "positive"
                        ? "bg-emerald-50 text-emerald-700"
                        : t.sentiment === "negative"
                        ? "bg-red-50 text-red-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {review.photo_path && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5 flex items-center gap-1">
                <Camera className="w-3 h-3" /> Photo
              </h3>
              {photoUrl ? (
                <img src={photoUrl} alt="Review photo" className="rounded-xl w-full max-h-96 object-cover border" />
              ) : (
                <div className="bg-gray-100 rounded-xl h-48 animate-pulse" />
              )}
            </div>
          )}

          {review.client && (
            <div className="pt-3 border-t text-xs text-gray-500">
              {review.client.email && <p>Email: {review.client.email}</p>}
              {review.admin_read_at && (
                <p>Marked read: {new Date(review.admin_read_at).toLocaleString()}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
