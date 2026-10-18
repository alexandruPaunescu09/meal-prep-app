import { notFound } from "next/navigation";
import MealPlanGrid from "./meal-plan-grid";

type GridProps = React.ComponentProps<typeof MealPlanGrid>;
import { getMealPlanDetail } from "@/lib/data/meal-plans";
import { getMealPlanSiblings } from "@/lib/data/meal-plan-siblings";

export default async function MealPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getMealPlanDetail(id);

  if (!bundle) notFound();

  const plan = bundle.plan as { client_id: string | null; week_start: string };
  const siblings = await getMealPlanSiblings(id, plan.client_id, plan.week_start);

  return (
    <MealPlanGrid
      plan={bundle.plan as GridProps["plan"]}
      entries={bundle.entries as GridProps["entries"]}
      recipes={bundle.recipes}
      clients={bundle.clients}
      ingredients={bundle.ingredients}
      categories={bundle.categories}
      reviews={bundle.reviews}
      statuses={bundle.statuses}
      siblings={siblings}
    />
  );
}
