/** Shared URL-state helpers for the reviews inbox (server page + client). */

export type ReviewSort = "newest" | "lowest" | "highest";

export const REVIEW_SORT_OPTIONS: { value: ReviewSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "lowest", label: "Lowest rating first" },
  { value: "highest", label: "Highest rating first" },
];

export function parseReviewSort(v: string | undefined): ReviewSort {
  return v === "lowest" || v === "highest" ? v : "newest";
}

export interface ReviewFilters {
  unread: boolean;
  client: string;
  minRating: number;
  photo: boolean;
  sort: ReviewSort;
}

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = {
  unread: false,
  client: "",
  minRating: 0,
  photo: false,
  sort: "newest",
};

/** Serialises non-default filters only, so the default view has a clean URL. */
export function reviewFiltersToQuery(f: ReviewFilters): string {
  const p = new URLSearchParams();
  if (f.unread) p.set("unread", "1");
  if (f.client) p.set("client", f.client);
  if (f.minRating) p.set("min", String(f.minRating));
  if (f.photo) p.set("photo", "1");
  if (f.sort !== "newest") p.set("sort", f.sort);
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
