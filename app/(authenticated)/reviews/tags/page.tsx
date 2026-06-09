import { createServer } from "@/lib/supabase/server";
import { ReviewTag } from "@/lib/supabase/types";
import TagsClient from "./tags-client";

export default async function ReviewTagsPage() {
  const supabase = await createServer();
  const { data } = await supabase
    .from("review_tags")
    .select("*")
    .order("sort_order");

  return <TagsClient initialTags={(data as ReviewTag[]) ?? []} />;
}
