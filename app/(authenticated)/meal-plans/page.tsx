import { getMealPlansWithClient } from "@/lib/data/meal-plans";
import { getClients } from "@/lib/data/clients";
import MealPlansClient from "./meal-plans-client";

type SP = { client?: string; week?: string; new?: string };

export default async function MealPlansPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const [mealPlans, clients] = await Promise.all([
    getMealPlansWithClient(),
    getClients(),
  ]);

  return (
    <MealPlansClient
      mealPlans={mealPlans as unknown as React.ComponentProps<typeof MealPlansClient>["mealPlans"]}
      clients={clients}
      initialClientId={typeof sp.client === "string" ? sp.client : ""}
      initialWeek={typeof sp.week === "string" ? sp.week : ""}
      openNew={sp.new === "1"}
    />
  );
}
