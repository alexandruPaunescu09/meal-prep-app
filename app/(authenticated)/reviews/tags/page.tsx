import TagsClient from "./tags-client";
import { getReviewTags } from "@/lib/data/reviews";

export default async function ReviewTagsPage() {
  const tags = await getReviewTags();
  return <TagsClient initialTags={tags} />;
}
