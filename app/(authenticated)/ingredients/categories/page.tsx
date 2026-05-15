import { createServer } from "@/lib/supabase/server";
import { Category } from "@/lib/supabase/types";
import CategoriesClient from "./categories-client";

export default async function CategoriesPage() {
  const supabase = await createServer();
  const [{ data: categories }, { data: ingredientCounts }] = await Promise.all([
    supabase.from("ingredient_categories").select("*").order("sort_order"),
    supabase.from("ingredients").select("category"),
  ]);

  const countMap: Record<string, number> = {};
  for (const row of ingredientCounts ?? []) {
    countMap[row.category] = (countMap[row.category] ?? 0) + 1;
  }

  return (
    <CategoriesClient
      categories={(categories as Category[]) ?? []}
      ingredientCounts={countMap}
    />
  );
}
