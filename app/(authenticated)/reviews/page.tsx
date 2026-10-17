import ReviewsClient from "./reviews-client";
import Link from "next/link";
import { getReviewsBundle } from "@/lib/data/reviews";
import { parseReviewSort, type ReviewFilters } from "./review-filters";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function ReviewsInboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { reviews, tags, clients, tagLinks } = await getReviewsBundle();

  const clientParam = first(sp.client) ?? "";
  const minParam = parseInt(first(sp.min) ?? "", 10);
  const initialFilters: ReviewFilters = {
    unread: first(sp.unread) === "1",
    client: clients.some((c) => c.id === clientParam) ? clientParam : "",
    minRating: minParam >= 1 && minParam <= 5 ? minParam : 0,
    photo: first(sp.photo) === "1",
    sort: parseReviewSort(first(sp.sort)),
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Reviews</h1>
        <Link
          href="/reviews/tags"
          className="text-sm text-emerald-700 hover:text-emerald-800 font-medium"
        >
          Manage tags →
        </Link>
      </div>

      <ReviewsClient
        reviews={reviews}
        tags={tags}
        tagLinks={tagLinks}
        clients={clients}
        initialFilters={initialFilters}
      />
    </div>
  );
}
