import { createServer } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import {
  MealEntryStatus,
  MealPlanEntry,
  MealReview,
} from "@/lib/supabase/types";
import {
  formatLocalDate,
  mondayOfWeek,
  parseLocalDate,
} from "@/lib/portal/entry-helpers";
import PlanDetailClient from "./plan-detail-client";

export default async function PortalPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.client_id) redirect("/login");

  const { data: plan } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!plan || plan.client_id !== profile.client_id) notFound();

  const { data: entries } = await supabase
    .from("meal_plan_entries")
    .select(`
      *,
      recipe:recipes_public (
        *,
        recipe_ingredients (
          *,
          ingredient:ingredients_public (*)
        )
      ),
      ingredient:ingredients_public (*)
    `)
    .eq("meal_plan_id", id);

  const entryIds = (entries ?? []).map((e: MealPlanEntry) => e.id);

  const [statusesRes, reviewsRes] = await Promise.all([
    entryIds.length
      ? supabase.from("meal_entry_status").select("*").in("meal_plan_entry_id", entryIds)
      : Promise.resolve({ data: [] }),
    entryIds.length
      ? supabase.from("meal_reviews").select("*").in("meal_plan_entry_id", entryIds)
      : Promise.resolve({ data: [] }),
  ]);

  const today = new Date();
  const todayStr = formatLocalDate(today);
  const currentMonday = mondayOfWeek(today);
  const isCurrent = plan.week_start === currentMonday;
  // Both dates are local calendar days; Math.round absorbs DST's 23/25-hour days.
  const todayLocal = parseLocalDate(todayStr);
  const weekStartLocal = parseLocalDate(plan.week_start);
  const dayOffset =
    todayLocal && weekStartLocal
      ? Math.round((todayLocal.getTime() - weekStartLocal.getTime()) / 86400000)
      : -1;
  const initialDow = isCurrent && dayOffset >= 0 && dayOffset <= 6 ? dayOffset + 1 : 1;

  return (
    <PlanDetailClient
      plan={plan}
      entries={(entries ?? []) as React.ComponentProps<typeof PlanDetailClient>["entries"]}
      statuses={(statusesRes.data as MealEntryStatus[]) ?? []}
      reviews={(reviewsRes.data as MealReview[]) ?? []}
      isCurrent={isCurrent}
      initialDow={initialDow}
      todayDate={todayStr}
    />
  );
}
