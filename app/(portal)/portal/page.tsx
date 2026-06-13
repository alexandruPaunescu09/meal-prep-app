import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Client,
  MealEntryStatus,
  MealPlan,
  MealPlanEntry,
  MealReview,
} from "@/lib/supabase/types";
import {
  addDaysLocal,
  compareLocalDate,
  formatLocalDate,
  isValidLocalDate,
} from "@/lib/portal/entry-helpers";
import { resolvePlanForDate } from "@/lib/portal/plan-resolver";
import TodayClient from "./today-client";
import Link from "next/link";

export default async function PortalTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.client_id) redirect("/login");

  const today = new Date();
  const todayStr = formatLocalDate(today);
  const params = await searchParams;
  const requested = params?.date;
  const selectedDate =
    requested && isValidLocalDate(requested) ? requested : todayStr;

  // Fetch every plan for this customer (used for both resolution and the
  // scrubber's plan-date highlights). This is a small list per customer.
  const { data: allPlansData } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("client_id", profile.client_id)
    .order("week_start", { ascending: false });

  const allPlans = (allPlansData as MealPlan[] | null) ?? [];

  // Build the set of YYYY-MM-DD dates the customer has a plan covering.
  const planDates: string[] = [];
  for (const p of allPlans) {
    for (let i = 0; i < 7; i++) planDates.push(addDaysLocal(p.week_start, i));
  }

  if (allPlans.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900">
          Today,{" "}
          {today.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </h1>
        <div className="bg-white rounded-2xl border p-6 text-center">
          <p className="text-gray-700 font-medium">
            No plan covers today yet.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Your trainer will share a plan when it&apos;s ready.
          </p>
          <Link
            href="/portal/plans"
            className="inline-block mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium"
          >
            View past plans
          </Link>
        </div>
      </div>
    );
  }

  const resolved = resolvePlanForDate(allPlans, selectedDate);

  let entries: MealPlanEntry[] = [];
  let statuses: MealEntryStatus[] = [];
  let reviews: MealReview[] = [];
  let planName: string | null = null;
  let planId: string | null = null;

  if (resolved) {
    const { plan, dayOfWeek } = resolved;
    planName = plan.name;
    planId = plan.id;

    const { data: entriesData } = await supabase
      .from("meal_plan_entries")
      .select(
        `
        *,
        recipe:recipes (
          *,
          recipe_ingredients (
            *,
            ingredient:ingredients (*)
          )
        ),
        ingredient:ingredients (*)
      `
      )
      .eq("meal_plan_id", plan.id)
      .eq("day_of_week", dayOfWeek);

    entries = (entriesData as MealPlanEntry[] | null) ?? [];
    const entryIds = entries.map((e) => e.id);

    if (entryIds.length) {
      const [statusesRes, reviewsRes] = await Promise.all([
        supabase
          .from("meal_entry_status")
          .select("*")
          .in("meal_plan_entry_id", entryIds),
        supabase
          .from("meal_reviews")
          .select("*")
          .in("meal_plan_entry_id", entryIds),
      ]);
      statuses = (statusesRes.data as MealEntryStatus[]) ?? [];
      reviews = (reviewsRes.data as MealReview[]) ?? [];
    }
  }

  const isFuture = compareLocalDate(selectedDate, todayStr) > 0;

  return (
    <TodayClient
      planId={planId}
      planName={planName}
      selectedDate={selectedDate}
      todayDate={todayStr}
      isFuture={isFuture}
      planDates={planDates}
      entries={(entries as any[]) ?? []}
      statuses={statuses}
      reviews={reviews}
    />
  );
}
