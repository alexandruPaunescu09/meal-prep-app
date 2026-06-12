import { getMealPlansWithClient } from "@/lib/data/meal-plans";
import { getClients } from "@/lib/data/clients";
import MealPlansClient from "./meal-plans-client";

export default async function MealPlansPage() {
  const [mealPlans, clients] = await Promise.all([
    getMealPlansWithClient(),
    getClients(),
  ]);

  return (
    <MealPlansClient
      mealPlans={mealPlans as any[]}
      clients={clients}
    />
  );
}
