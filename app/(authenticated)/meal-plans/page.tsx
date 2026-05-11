import { createServer } from "@/lib/supabase/server";
import { MealPlan, Client } from "@/lib/supabase/types";
import MealPlansClient from "./meal-plans-client";

export default async function MealPlansPage() {
  const supabase = await createServer();

  const { data: mealPlans } = await supabase
    .from("meal_plans")
    .select(`
      *,
      client:clients (*)
    `)
    .order("created_at", { ascending: false });

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .order("name");

  return (
    <MealPlansClient
      mealPlans={(mealPlans as any[]) ?? []}
      clients={(clients as Client[]) ?? []}
    />
  );
}
