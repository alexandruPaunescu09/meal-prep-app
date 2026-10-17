"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Client, ReviewTag } from "@/lib/supabase/types";
import type { FullReview } from "@/lib/data/reviews";
import { Star, Camera, Filter, CheckCheck } from "lucide-react";
import ReviewDetailModal from "@/components/admin/review-detail-modal";
import { invalidateMealReviews } from "@/lib/actions/revalidate";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { ReviewTagChip, TAG_MAX_VISIBLE } from "./tag-chip";
import {
  DEFAULT_REVIEW_FILTERS,
  REVIEW_SORT_OPTIONS,
  reviewFiltersToQuery,
  type ReviewFilters,
} from "./review-filters";

export default function ReviewsClient({
  reviews,
  tags,
  tagLinks,
  clients,
  initialFilters = DEFAULT_REVIEW_FILTERS,
}: {
  reviews: FullReview[];
  tags: ReviewTag[];
  tagLinks: { review_id: string; tag_id: string }[];
  clients: Pick<Client, "id" | "name">[];
  initialFilters?: ReviewFilters;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReviewFilters>(initialFilters);
  const [markingAll, setMarkingAll] = useState(false);

  const { unread, client: filterClient, minRating, photo, sort } = filters;

  const tagsByReview = useMemo(() => {
    const m = new Map<string, ReviewTag[]>();
    const tagById = new Map(tags.map((t) => [t.id, t]));
    for (const link of tagLinks) {
      const list = m.get(link.review_id) ?? [];
      const tag = tagById.get(link.tag_id);
      if (tag) list.push(tag);
      m.set(link.review_id, list);
    }
    return m;
  }, [tagLinks, tags]);

  const filtered = useMemo(() => {
    const list = reviews.filter((r) => {
      if (unread && r.admin_read_at) return false;
      if (filterClient && r.client_id !== filterClient) return false;
      if (minRating && r.rating < minRating) return false;
      if (photo && !r.photo_path) return false;
      return true;
    });
    const byNewest = (a: FullReview, b: FullReview) =>
      Date.parse(b.created_at) - Date.parse(a.created_at);
    if (sort === "lowest") {
      return list.sort((a, b) => a.rating - b.rating || byNewest(a, b));
    }
    if (sort === "highest") {
      return list.sort((a, b) => b.rating - a.rating || byNewest(a, b));
    }
    return list.sort(byNewest);
  }, [reviews, unread, filterClient, minRating, photo, sort]);

  const stats = useMemo(() => {
    const total = reviews.length;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const fresh = reviews.filter((r) => !r.admin_read_at).length;
    return {
      total,
      average: total ? (sum / total).toFixed(1) : null,
      fresh,
    };
  }, [reviews]);

  const filtersActive =
    unread || !!filterClient || minRating > 0 || photo || sort !== "newest";

  function patchFilters(patch: Partial<ReviewFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    // router.replace (not history.replaceState) keeps Next's internal URL in
    // sync, so a later router.refresh() doesn't restore stale params.
    router.replace(`${window.location.pathname}${reviewFiltersToQuery(next)}`, {
      scroll: false,
    });
  }

  /** Sets a review's read state. Returns true on success. */
  async function setReadState(review: FullReview, read: boolean): Promise<boolean> {
    const { error } = await supabase
      .from("meal_reviews")
      .update({ admin_read_at: read ? new Date().toISOString() : null })
      .eq("id", review.id);
    if (error) {
      toast.error(read ? "Could not mark as read" : "Could not mark as unread", {
        action: { label: "Retry", onClick: () => void setReadState(review, read) },
      });
      return false;
    }
    await invalidateMealReviews();
    router.refresh();
    return true;
  }

  async function markAllRead() {
    setMarkingAll(true);
    const { data, error } = await supabase
      .from("meal_reviews")
      .update({ admin_read_at: new Date().toISOString() })
      .is("admin_read_at", null)
      .select("id");
    setMarkingAll(false);
    if (error) {
      toast.error("Could not mark all as read", {
        action: { label: "Retry", onClick: () => void markAllRead() },
      });
      return;
    }
    const count = data?.length ?? 0;
    if (count > 0) toast.success(`Marked ${count} as read`);
    await invalidateMealReviews();
    router.refresh();
  }

  const open = openId ? reviews.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Reviews</p>
          <p className="text-xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white border rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">Average</p>
          <p className="text-xl font-bold text-amber-600 flex items-center gap-1">
            {stats.average ?? "–"}
            {stats.average && <Star className="w-4 h-4 fill-current" aria-hidden="true" />}
          </p>
        </div>
        <div className="bg-white border rounded-xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">New</p>
          <p className="text-xl font-bold text-emerald-700">{stats.fresh}</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap bg-white border rounded-xl p-3">
        <Filter className="w-4 h-4 text-gray-400" aria-hidden="true" />
        <button
          type="button"
          aria-pressed={unread}
          onClick={() => patchFilters({ unread: !unread })}
          className={`text-xs px-2.5 py-1 rounded-full border ${
            unread
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "bg-white border-gray-200 text-gray-700"
          }`}
        >
          Unread
        </button>
        <select
          aria-label="Filter by client"
          value={filterClient}
          onChange={(e) => patchFilters({ client: e.target.value })}
          className="text-xs px-2.5 py-1 rounded-full border bg-white text-gray-700 border-gray-200"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          aria-label="Filter by minimum rating"
          value={minRating}
          onChange={(e) => patchFilters({ minRating: parseInt(e.target.value, 10) })}
          className="text-xs px-2.5 py-1 rounded-full border bg-white text-gray-700 border-gray-200"
        >
          <option value="0">Any rating</option>
          <option value="1">≥ 1★</option>
          <option value="2">≥ 2★</option>
          <option value="3">≥ 3★</option>
          <option value="4">≥ 4★</option>
          <option value="5">5★ only</option>
        </select>
        <button
          type="button"
          aria-pressed={photo}
          onClick={() => patchFilters({ photo: !photo })}
          className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 ${
            photo
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "bg-white border-gray-200 text-gray-700"
          }`}
        >
          <Camera className="w-3 h-3" aria-hidden="true" />
          With photo
        </button>
        <select
          aria-label="Sort reviews"
          value={sort}
          onChange={(e) => patchFilters({ sort: e.target.value as ReviewFilters["sort"] })}
          className="text-xs px-2.5 py-1 rounded-full border bg-white text-gray-700 border-gray-200"
        >
          {REVIEW_SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {filtersActive && (
          <button
            type="button"
            onClick={() => patchFilters({ ...DEFAULT_REVIEW_FILTERS })}
            className="text-xs text-emerald-700 hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500" aria-live="polite">
          {filtered.length} shown
        </span>
      </div>

      {/* List header actions */}
      {stats.fresh > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
          >
            <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
            {markingAll ? "Marking…" : `Mark all read (${stats.fresh})`}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-500">
          {reviews.length === 0
            ? "No reviews yet."
            : "No reviews match the current filters."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const isUnread = !r.admin_read_at;
            const reviewTags = tagsByReview.get(r.id) ?? [];
            const hiddenTags = Math.max(0, reviewTags.length - TAG_MAX_VISIBLE);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(r.id);
                    if (isUnread) void setReadState(r, true);
                  }}
                  aria-label={`Review by ${r.client?.name ?? "unknown client"}, ${r.rating} stars${isUnread ? ", new" : ""}`}
                  className="w-full text-left bg-white rounded-xl border p-3 hover:border-emerald-300 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <span className="inline-flex items-center gap-0.5 text-sm font-bold text-amber-600">
                        <Star className="w-4 h-4 fill-current" aria-hidden="true" />
                        {r.rating}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 text-sm">
                          {r.client?.name ?? "Unknown"}
                        </p>
                        <span className="text-gray-300" aria-hidden="true">·</span>
                        <p className="text-sm text-gray-700">{r.recipe?.name ?? "Deleted recipe"}</p>
                        {isUnread && (
                          <span className="text-[10px] uppercase tracking-wide font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                            New
                          </span>
                        )}
                        {r.photo_path && (
                          <Camera className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                        )}
                      </div>
                      {r.comment && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{r.comment}</p>
                      )}
                      {reviewTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {reviewTags.slice(0, TAG_MAX_VISIBLE).map((t) => (
                            <ReviewTagChip key={t.id} tag={t} />
                          ))}
                          {hiddenTags > 0 && (
                            <span className="text-[11px] px-1.5 py-0.5 text-gray-500">
                              +{hiddenTags} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {formatDate(r.created_at)}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <ReviewDetailModal
          review={open}
          tags={tagsByReview.get(open.id) ?? []}
          onClose={() => setOpenId(null)}
          onSetRead={setReadState}
        />
      )}
    </div>
  );
}
