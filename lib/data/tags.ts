/**
 * Single source of truth for cache tags used by `unstable_cache` reads
 * and `revalidateTag` writes. Keeping the strings here prevents drift between
 * data-layer cache wrappers and form invalidation actions.
 *
 * Static tags are plain string literals; per-id tags use helper functions so
 * we never accidentally cache or invalidate the wrong key.
 */
export const CACHE_TAGS = {
  ingredients: "ingredients",
  categories: "ingredient-categories",
  recipes: "recipes",
  recipeRatings: "recipe-rating-stats",
  clients: "clients",
  profiles: "profiles",
  mealPlans: "meal-plans",
  mealPlanDetail: (id: string) => `meal-plan:${id}`,
  containerTypes: "container-types",
  containerDeliveries: "container-deliveries",
  prepRules: "prep-rules",
  reviews: "reviews",
  reviewTags: "review-tags",
  mealReviews: "meal-reviews",
  mealEntryStatuses: "meal-entry-statuses",
} as const;
