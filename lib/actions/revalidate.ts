"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/data/tags";

/**
 * Server actions that mutation forms call after a successful save to invalidate
 * the corresponding cached reads. Each action invalidates exactly the tags that
 * are affected by that mutation.
 *
 * Why `updateTag` and not `revalidateTag`:
 *   These run inside server actions and we want read-your-own-writes — the
 *   user just saved a row and the next render must show it. `updateTag`
 *   expires the cached entry immediately so the subsequent server-component
 *   read pulls fresh data. `revalidateTag(tag, "max")` would serve stale
 *   data once more before refreshing in the background, which is wrong here.
 *
 * Forms call these *before* `router.refresh()` (when they still need to refresh)
 * so that the refresh re-runs the now-expired cached helpers and pulls fresh
 * data from Postgres.
 *
 * The meal-plan grid's optimistic mutation paths use these instead of
 * `router.refresh()` — the local state is already correct; the tag update
 * just makes sure the next navigation sees fresh data.
 */

export async function invalidateIngredients() {
  updateTag(CACHE_TAGS.ingredients);
}

export async function invalidateCategories() {
  // Categories changes affect ingredient grouping in lists, so bust both.
  updateTag(CACHE_TAGS.categories);
  updateTag(CACHE_TAGS.ingredients);
}

export async function invalidateRecipes() {
  updateTag(CACHE_TAGS.recipes);
}

export async function invalidateRecipeRatings() {
  updateTag(CACHE_TAGS.recipeRatings);
}

export async function invalidateClients() {
  updateTag(CACHE_TAGS.clients);
}

export async function invalidateProfiles() {
  // Inviting/revoking a customer changes portal_status; clients caches
  // depend on this tag.
  updateTag(CACHE_TAGS.profiles);
}

export async function invalidateMealPlans() {
  updateTag(CACHE_TAGS.mealPlans);
}

export async function invalidateMealPlan(id: string) {
  updateTag(CACHE_TAGS.mealPlanDetail(id));
}

export async function invalidateContainerTypes() {
  // Container type edits cascade to recipes (which reference them).
  updateTag(CACHE_TAGS.containerTypes);
  updateTag(CACHE_TAGS.recipes);
}

export async function invalidateContainerDeliveries() {
  updateTag(CACHE_TAGS.containerDeliveries);
}

export async function invalidatePrepRules() {
  updateTag(CACHE_TAGS.prepRules);
}

export async function invalidateMealReviews() {
  updateTag(CACHE_TAGS.mealReviews);
}

export async function invalidateReviewTags() {
  updateTag(CACHE_TAGS.reviewTags);
}

export async function invalidateMealEntryStatuses() {
  updateTag(CACHE_TAGS.mealEntryStatuses);
}
