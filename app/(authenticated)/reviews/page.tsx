import { createServer } from "@/lib/supabase/server";
import { Client, MealReview, Recipe, ReviewTag } from "@/lib/supabase/types";
import ReviewsClient from "./reviews-client";
import Link from "next/link";

export default async function ReviewsInboxPage() {
  const supabase = await createServer();

  const [reviewsRes, tagsRes, clientsRes] = await Promise.all([
    supabase
      .from("meal_reviews")
      .select(`
        *,
        client:clients (id, name, email),
        recipe:recipes (id, name)
      `)
      .order("created_at", { ascending: false }),
    supabase.from("review_tags").select("*").order("sort_order"),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  const reviewIds = ((reviewsRes.data as MealReview[]) ?? []).map((r) => r.id);
  let tagLinks: { review_id: string; tag_id: string }[] = [];
  if (reviewIds.length > 0) {
    const { data } = await supabase
      .from("meal_review_tags")
      .select("review_id, tag_id")
      .in("review_id", reviewIds);
    tagLinks = (data as { review_id: string; tag_id: string }[]) ?? [];
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reviews</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {reviewsRes.data?.length ?? 0} total
          </p>
        </div>
        <Link
          href="/reviews/tags"
          className="text-sm text-emerald-700 hover:text-emerald-800 font-medium"
        >
          Manage tags →
        </Link>
      </div>

      <ReviewsClient
        reviews={(reviewsRes.data as (MealReview & { client?: Client; recipe?: Recipe })[]) ?? []}
        tags={(tagsRes.data as ReviewTag[]) ?? []}
        tagLinks={tagLinks}
        clients={(clientsRes.data as Pick<Client, "id" | "name">[]) ?? []}
      />
    </div>
  );
}
