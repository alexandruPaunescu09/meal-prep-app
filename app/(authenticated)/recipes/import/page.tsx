import { getIngredients, getIngredientCategories } from "@/lib/data/ingredients";
import { getContainerTypes } from "@/lib/data/containers";
import RecipeImportClient from "./import-client";
import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ImportRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const sp = await searchParams;
  const rawUrl = Array.isArray(sp.url) ? sp.url[0] : sp.url;

  const [ingredients, categories, containerTypes] = await Promise.all([
    getIngredients(),
    getIngredientCategories(),
    getContainerTypes(),
  ]);

  return (
    <RecipeImportClient
      key={user.id}
      ownerId={user.id}
      ingredients={ingredients}
      categories={categories}
      containerTypes={containerTypes}
      initialUrl={rawUrl?.trim() || null}
    />
  );
}
