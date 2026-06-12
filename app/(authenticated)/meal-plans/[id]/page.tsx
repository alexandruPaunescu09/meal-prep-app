import { notFound } from "next/navigation";
import MealPlanGrid from "./meal-plan-grid";
import { getMealPlanDetail } from "@/lib/data/meal-plans";

export default async function MealPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getMealPlanDetail(id);

  if (!bundle) notFound();

  return (
    <MealPlanGrid
      plan={bundle.plan as any}
      entries={bundle.entries as any[]}
      recipes={bundle.recipes as any[]}
      clients={bundle.clients}
      ingredients={bundle.ingredients}
      categories={bundle.categories}
      reviews={bundle.reviews}
      statuses={bundle.statuses}
    />
  );
}
