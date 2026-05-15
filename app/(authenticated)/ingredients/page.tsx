import { createServer } from "@/lib/supabase/server";
import { Ingredient, Category } from "@/lib/supabase/types";
import IngredientsClient from "./ingredients-client";

export default async function IngredientsPage() {
  const supabase = await createServer();
  const [{ data: ingredients }, { data: categories }] = await Promise.all([
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("ingredient_categories").select("*").order("sort_order"),
  ]);

  return (
    <IngredientsClient
      ingredients={(ingredients as Ingredient[]) ?? []}
      categories={(categories as Category[]) ?? []}
    />
  );
}
