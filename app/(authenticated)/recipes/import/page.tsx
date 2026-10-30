import { getIngredients, getIngredientCategories } from "@/lib/data/ingredients";
import { getContainerTypes } from "@/lib/data/containers";
import { resolveSharedInput } from "@/lib/recipes/import/share";
import RecipeImportClient from "./import-client";

export default async function ImportRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // `url` is the contract; Android share sends `title`/`text` too, and often hides the link in `text`.
  const shared = resolveSharedInput({ url: first(sp.url), text: first(sp.text), title: first(sp.title) });

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
      initialUrl={shared?.kind === "url" ? shared.url : null}
      initialText={shared?.kind === "text" ? shared.text : null}
    />
  );
}
