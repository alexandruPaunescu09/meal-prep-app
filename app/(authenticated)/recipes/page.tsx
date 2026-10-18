import {
  getRecipesWithIngredients,
  getRecipeRatingStats,
} from "@/lib/data/recipes";
import RecipesClient from "./recipes-client";

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const openNew = first(sp.new) === "1";
  const editId = first(sp.edit) ?? null;

  const [recipes, ratingStats] = await Promise.all([
    getRecipesWithIngredients(),
    getRecipeRatingStats(),
  ]);

  return (
    <RecipesClient
      // Remount when the deep-link params change so the form opens/closes.
      key={`${openNew ? "new" : ""}|${editId ?? ""}`}
      recipes={recipes as React.ComponentProps<typeof RecipesClient>["recipes"]}
      ratingStats={ratingStats}
      initialNew={openNew}
      initialEditId={editId}
    />
  );
}
