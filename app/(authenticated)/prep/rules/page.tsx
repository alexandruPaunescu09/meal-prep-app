import { createServer } from "@/lib/supabase/server";
import PrepRulesClient from "./prep-rules-client";

export default async function PrepRulesPage() {
  const supabase = await createServer();
  const [{ data: rules }, { data: ingredients }, { data: categories }] = await Promise.all([
    supabase.from("prep_rules").select("*, ingredient:ingredients(id, name, category)").order("created_at"),
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("ingredient_categories").select("*").order("sort_order"),
  ]);

  return (
    <PrepRulesClient
      rules={(rules as any[]) ?? []}
      ingredients={(ingredients as any[]) ?? []}
      categories={(categories as any[]) ?? []}
    />
  );
}
