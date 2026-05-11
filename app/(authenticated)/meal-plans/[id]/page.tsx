import { createServer } from "@/lib/supabase/server";
import { Client } from "@/lib/supabase/types";
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

  const { data: entries } = await supabase
    .from("meal_plan_entries")
    .select(`
      *,
      recipe:recipes (
        *,
        recipe_ingredients (
          *,
          ingredient:ingredients (*)
        )
      )
    `)
    .eq("meal_plan_id", id);

  const { data: recipes } = await supabase
    .from("recipes")
    .select("id, name, category, portions")
    .order("name");

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name");

  return (
    <MealPlanGrid
      plan={plan as any}
      entries={(entries as any[]) ?? []}
      recipes={(recipes as any[]) ?? []}
      clients={(clients as Client[]) ?? []}
    />
  );
}
