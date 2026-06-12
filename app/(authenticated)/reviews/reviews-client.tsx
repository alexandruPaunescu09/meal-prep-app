"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  Client,
  MealReview,
  Recipe,
  ReviewTag,
} from "@/lib/supabase/types";
import { Star, Camera, Filter } from "lucide-react";
import ReviewDetailModal from "@/components/admin/review-detail-modal";
import { invalidateMealReviews } from "@/lib/actions/revalidate";

type FullReview = MealReview & { client?: Client; recipe?: Recipe };

export default function ReviewsClient({
  reviews,
  tags,
  tagLinks,
  clients,
}: {
  reviews: FullReview[];
  tags: ReviewTag[];
  tagLinks: { review_id: string; tag_id: string }[];
  clients: Pick<Client, "id" | "name">[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [filterUnread, setFilterUnread] = useState(false);
  const [filterClient, setFilterClient] = useState<string>("");
  const [filterMinRating, setFilterMinRating] = useState<number>(0);
  const [filterPhoto, setFilterPhoto] = useState(false);

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
    return reviews.filter((r) => {
      if (filterUnread && r.admin_read_at) return false;
      if (filterClient && r.client_id !== filterClient) return false;
      if (filterMinRating && r.rating < filterMinRating) return false;
      if (filterPhoto && !r.photo_path) return false;
      return true;
    });
  }, [reviews, filterUnread, filterClient, filterMinRating, filterPhoto]);

  async function markRead(id: string) {
    await supabase
      .from("meal_reviews")
      .update({ admin_read_at: new Date().toISOString() })
      .eq("id", id);
    await invalidateMealReviews();
    router.refresh();
  }

  const open = openId ? reviews.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap bg-white border rounded-xl p-3">
        <Filter className="w-4 h-4 text-gray-400" />
        <button
          onClick={() => setFilterUnread((v) => !v)}
          className={`text-xs px-2.5 py-1 rounded-full border ${
            filterUnread
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "bg-white border-gray-200 text-gray-700"
          }`}
        >
          Unread
        </button>
        <select
          value={filterClient}
          onChange={(e) => setFilterClient(e.target.value)}
          className="text-xs px-2.5 py-1 rounded-full border bg-white text-gray-700 border-gray-200"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={filterMinRating}
          onChange={(e) => setFilterMinRating(parseInt(e.target.value))}
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
          onClick={() => setFilterPhoto((v) => !v)}
          className={`text-xs px-2.5 py-1 rounded-full border flex items-center gap-1 ${
            filterPhoto
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "bg-white border-gray-200 text-gray-700"
          }`}
        >
          <Camera className="w-3 h-3" />
          With photo
        </button>
        <span className="ml-auto text-xs text-gray-500">{filtered.length} shown</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-500">
          No reviews match the current filters.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const isUnread = !r.admin_read_at;
            const reviewTags = tagsByReview.get(r.id) ?? [];
            return (
              <li key={r.id}>
                <button
                  onClick={() => {
                    setOpenId(r.id);
                    if (isUnread) markRead(r.id);
                  }}
                  className="w-full text-left bg-white rounded-xl border p-3 hover:border-emerald-300 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <span className="inline-flex items-center gap-0.5 text-sm font-bold text-amber-600">
                        <Star className="w-4 h-4 fill-current" />
                        {r.rating}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 text-sm">
                          {r.client?.name ?? "Unknown"}
                        </p>
                        <span className="text-gray-300">·</span>
                        <p className="text-sm text-gray-700">{r.recipe?.name ?? "Deleted recipe"}</p>
                        {isUnread && (
                          <span className="text-[10px] uppercase tracking-wide font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                            New
                          </span>
                        )}
                        {r.photo_path && <Camera className="w-3.5 h-3.5 text-gray-400" />}
                      </div>
                      {r.comment && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{r.comment}</p>
                      )}
                      {reviewTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {reviewTags.slice(0, 4).map((t) => (
                            <span
                              key={t.id}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
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
                      )}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {new Date(r.created_at).toLocaleDateString()}
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
        />
      )}
    </div>
  );
}
