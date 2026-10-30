import { getIngredients, getIngredientCategories } from "@/lib/data/ingredients";
import { getContainerTypes } from "@/lib/data/containers";
import RecipeImportClient from "./import-client";

export default async function ImportRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const rawUrl = Array.isArray(sp.url) ? sp.url[0] : sp.url;

  const [ingredients, categories, containerTypes] = await Promise.all([
    getIngredients(),
    getIngredientCategories(),
    getContainerTypes(),
  ]);

  return (
    <RecipeImportClient
      ingredients={ingredients}
      categories={categories}
      containerTypes={containerTypes}
      initialUrl={rawUrl?.trim() || null}
    />
  );
}
