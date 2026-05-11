import { createServer } from "@/lib/supabase/server";
import { Ingredient, IngredientCategory } from "@/lib/supabase/types";
import IngredientsClient from "./ingredients-client";

export default async function IngredientsPage() {
  const supabase = await createServer();
  const { data: ingredients } = await supabase
    .from("ingredients")
    .select("*")
    .order("name");

  return <IngredientsClient ingredients={(ingredients as Ingredient[]) ?? []} />;
}
