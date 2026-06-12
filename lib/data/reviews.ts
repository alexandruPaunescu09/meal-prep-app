import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";
import type {
  Client,
  MealReview,
  Recipe,
  ReviewTag,
} from "@/lib/supabase/types";

const REVALIDATE = 300;

/**
 * Unread reviews count for the layout's badge. Tagged on `mealReviews` so
 * the badge updates the moment a customer submits a review (after the
 * portal API revalidates the tag) or the admin marks one as read.
 */
export const getUnreadReviewCount = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("meal_reviews")
      .select("id", { count: "exact", head: true })
      .is("admin_read_at", null);
    return count ?? 0;
  },
  ["unread-review-count"],
  { tags: [CACHE_TAGS.mealReviews], revalidate: REVALIDATE }
);

export interface ReviewsBundle {
  reviews: (MealReview & { client?: Client; recipe?: Recipe })[];
  tags: ReviewTag[];
  clients: Pick<Client, "id" | "name">[];
  tagLinks: { review_id: string; tag_id: string }[];
}

/**
 * The reviews-inbox bundle. Includes review→client→recipe joins, all tags,
 * a slim client list for filtering, and the review_tag junction rows.
 */
export const getReviewsBundle = unstable_cache(
  async (): Promise<ReviewsBundle> => {
    const supabase = createServiceClient();

    const [reviewsRes, tagsRes, clientsRes] = await Promise.all([
      supabase
        .from("meal_reviews")
        .select(
          `
          *,
          client:clients (id, name, email),
          recipe:recipes (id, name)
        `
        )
        .order("created_at", { ascending: false }),
      supabase.from("review_tags").select("*").order("sort_order"),
      supabase.from("clients").select("id, name").order("name"),
    ]);

    const reviews =
      (reviewsRes.data as (MealReview & {
        client?: Client;
        recipe?: Recipe;
      })[]) ?? [];

    let tagLinks: { review_id: string; tag_id: string }[] = [];
    if (reviews.length > 0) {
      const reviewIds = reviews.map((r) => r.id);
      const { data } = await supabase
        .from("meal_review_tags")
        .select("review_id, tag_id")
        .in("review_id", reviewIds);
      tagLinks = (data as { review_id: string; tag_id: string }[]) ?? [];
    }

    return {
      reviews,
      tags: (tagsRes.data as ReviewTag[]) ?? [],
      clients: (clientsRes.data as Pick<Client, "id" | "name">[]) ?? [],
      tagLinks,
    };
  },
  ["reviews-bundle"],
  {
    tags: [
      CACHE_TAGS.mealReviews,
      CACHE_TAGS.reviewTags,
      CACHE_TAGS.clients,
      CACHE_TAGS.recipes,
    ],
    revalidate: REVALIDATE,
  }
);

export const getReviewTags = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("review_tags")
      .select("*")
      .order("sort_order");
    return (data as ReviewTag[]) ?? [];
  },
  ["review-tags-list"],
  { tags: [CACHE_TAGS.reviewTags], revalidate: REVALIDATE }
);
