"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, Camera, ExternalLink } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ReviewTag } from "@/lib/supabase/types";
import type { FullReview } from "@/lib/data/reviews";
import { getSignedReviewPhotoUrl } from "@/lib/portal/storage";
import { formatDateTime, formatWeekRange } from "@/lib/format";
import { ReviewTagChip } from "@/app/(authenticated)/reviews/tag-chip";

const LINK_CLASS =
  "inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-emerald-300";

export default function ReviewDetailModal({
  review,
  tags,
  onClose,
  onSetRead,
}: {
  review: FullReview;
  tags: ReviewTag[];
  onClose: () => void;
  /** Resolves true when the write succeeded. The parent owns the toast. */
  onSetRead: (review: FullReview, read: boolean) => Promise<boolean>;
}) {
  // undefined = loading, null = unavailable, string = signed URL
  const [photoUrl, setPhotoUrl] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const isRead = !!review.admin_read_at;

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

  async function toggleRead() {
    setBusy(true);
    await onSetRead(review, !isRead);
    setBusy(false);
  }

  const recipeId = review.recipe?.id ?? review.recipe_id;
  const planWeek = review.plan ? formatWeekRange(review.plan.week_start) : null;

  const footer = (
    <div className="flex flex-wrap items-center gap-2 w-full">
      <button
        type="button"
        onClick={toggleRead}
        disabled={busy}
        className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {isRead ? "Mark unread" : "Mark read"}
      </button>
      <div className="ml-auto flex flex-wrap justify-end gap-2">
        {recipeId && (
          <Link href={`/recipes?edit=${recipeId}`} className={LINK_CLASS}>
            View recipe
          </Link>
        )}
        {review.plan && (
          <Link href={`/meal-plans/${review.plan.id}`} className={LINK_CLASS}>
            View plan{planWeek ? ` · ${planWeek}` : ""}
          </Link>
        )}
        <Link href={`/clients#client-${review.client_id}`} className={LINK_CLASS}>
          Client
        </Link>
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-0.5 font-bold text-amber-600">
            <Star className="w-5 h-5 fill-current" aria-hidden="true" />
            <span aria-label={`${review.rating} stars`}>{review.rating}</span>
          </span>
          <span>{review.recipe?.name ?? "Deleted recipe"}</span>
        </span>
      }
      description={`${review.client?.name ?? "Unknown"} · ${formatDateTime(review.created_at)}`}
      footer={footer}
    >
      <div className="space-y-4">
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
                <ReviewTagChip key={t.id} tag={t} size="sm" />
              ))}
            </div>
          </div>
        )}

        {review.photo_path && (
          <div>
            <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-1.5 flex items-center gap-1">
              <Camera className="w-3 h-3" aria-hidden="true" /> Photo
            </h3>
            {photoUrl === undefined ? (
              <div className="bg-gray-100 rounded-xl h-48 animate-pulse" aria-label="Loading photo" />
            ) : photoUrl === null ? (
              <p className="text-sm text-gray-500">Photo unavailable.</p>
            ) : (
              <a
                href={photoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
                aria-label="Open review photo at full size in a new tab"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoUrl}
                  alt="Review photo"
                  className="rounded-xl w-full max-h-96 object-contain bg-gray-50 border group-hover:opacity-90"
                />
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-700 group-hover:underline">
                  Open full size <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </span>
              </a>
            )}
          </div>
        )}

        {review.client?.email && (
          <div className="pt-3 border-t text-xs text-gray-500 space-y-1">
            <p>Email: {review.client.email}</p>
            {review.admin_read_at && <p>Marked read: {formatDateTime(review.admin_read_at)}</p>}
          </div>
        )}
        {!review.client?.email && review.admin_read_at && (
          <div className="pt-3 border-t text-xs text-gray-500">
            <p>Marked read: {formatDateTime(review.admin_read_at)}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
