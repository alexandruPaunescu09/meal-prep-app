import { createServer } from "@/lib/supabase/server";
import { Client, Ingredient, Category, MealReview, MealEntryStatus } from "@/lib/supabase/types";
import { notFound } from "next/navigation";
import MealPlanGrid from "./meal-plan-grid";

export default async function MealPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServer();

  const { data: plan } = await supabase
    .from("meal_plans")
    .select(`
      *,
      client:clients (*)
    `)
    .eq("id", id)
    .single();

  if (!plan) notFound();

  const [{ data: entries }, { data: recipes }, { data: clients }, { data: ingredients }, { data: categories }] = await Promise.all([
    supabase
      .from("meal_plan_entries")
      .select(`
        *,
        recipe:recipes (
          *,
          recipe_ingredients (
            *,
            ingredient:ingredients (*)
          )
        ),
        ingredient:ingredients (*)
      `)
      .eq("meal_plan_id", id),
    supabase.from("recipes").select("id, name, portions").order("name"),
    supabase.from("clients").select("*").order("name"),
    supabase.from("ingredients").select("*").order("name"),
    supabase.from("ingredient_categories").select("*").order("sort_order"),
  ]);

  const entryIds = ((entries as { id: string }[]) ?? []).map((e) => e.id);
  const [{ data: reviews }, { data: statuses }] = entryIds.length
    ? await Promise.all([
        supabase.from("meal_reviews").select("*").in("meal_plan_entry_id", entryIds),
        supabase.from("meal_entry_status").select("*").in("meal_plan_entry_id", entryIds),
      ])
    : [{ data: [] as MealReview[] }, { data: [] as MealEntryStatus[] }];

  return (
    <MealPlanGrid
      plan={plan as any}
      entries={(entries as any[]) ?? []}
      recipes={(recipes as any[]) ?? []}
      clients={(clients as Client[]) ?? []}
      ingredients={(ingredients as Ingredient[]) ?? []}
      categories={(categories as Category[]) ?? []}
      reviews={(reviews as MealReview[]) ?? []}
      statuses={(statuses as MealEntryStatus[]) ?? []}
    />
  );
}
