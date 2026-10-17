import { getIngredients, getIngredientCategories } from "@/lib/data/ingredients";
import IngredientsClient, { type IngredientsInitialView } from "./ingredients-client";

type Search = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function IngredientsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const [ingredients, categories] = await Promise.all([
    getIngredients(),
    getIngredientCategories(),
  ]);

  const initial: IngredientsInitialView = {
    q: first(sp.q) ?? "",
    cat: first(sp.cat) ?? "all",
    quick: first(sp.f) ?? "all",
    sort: first(sp.sort) ?? "name",
    dir: first(sp.dir) === "desc" ? "desc" : "asc",
    openNew: first(sp.new) === "1",
    openScan: first(sp.scan) === "1",
    editId: first(sp.edit) ?? null,
  };

  return (
    <IngredientsClient
      ingredients={ingredients}
      categories={categories}
      initial={initial}
    />
  );
}
