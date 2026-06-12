import ReviewsClient from "./reviews-client";
import Link from "next/link";
import { getReviewsBundle } from "@/lib/data/reviews";

export default async function ReviewsInboxPage() {
  const { reviews, tags, clients, tagLinks } = await getReviewsBundle();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reviews</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {reviews.length} total
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
        reviews={reviews}
        tags={tags}
        tagLinks={tagLinks}
        clients={clients}
      />
    </div>
  );
}
