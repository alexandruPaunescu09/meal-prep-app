import { unstable_cache } from "next/cache";
import { createServiceClient } from "./service-client";
import { CACHE_TAGS } from "./tags";

const REVALIDATE = 300;

/**
 * Prep rules with embedded ingredient (id, name, category) for display.
 * Tagged on both prep-rules and ingredients so renaming an ingredient
 * propagates to the rules view.
 */
export const getPrepRules = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("prep_rules")
      .select("*, ingredient:ingredients(id, name, category)")
      .order("created_at");
    return (data as unknown[]) ?? [];
  },
  ["prep-rules-list"],
  { tags: [CACHE_TAGS.prepRules, CACHE_TAGS.ingredients], revalidate: REVALIDATE }
);
