import { cookies } from "next/headers";
import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  FoodLogEntry,
  MealEntryStatus,
  MealPlan,
  MealReview,
} from "@/lib/supabase/types";
import {
  addDaysLocal,
  compareLocalDate,
  isValidLocalDate,
} from "@/lib/portal/entry-helpers";
import { resolvePlanForDate } from "@/lib/portal/plan-resolver";
import { resolveDayTargets } from "@/lib/portal/day-targets";
import { todayInTz } from "@/lib/format";
import TodayClient from "./today-client";

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

  const { data: clientRow } = await supabase
    .from("clients")
    .select("calorie_target, weight_kg, target_weight_kg")
    .eq("id", profile.client_id)
    .maybeSingle();

  // The customer's local date: SSR runs in UTC, so use the browser timezone the client stored in
  // a cookie (todayInTz falls back to the business timezone before it is known).
  const cookieStore = await cookies();
  const todayStr = todayInTz(cookieStore.get("tz")?.value);
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

  // YYYY-MM-DD dates that actually have meals (a plan covering a week with no
  // entries on a given day shouldn't be marked or offered as a destination).
  const planDates: string[] = [];
  if (allPlans.length > 0) {
    const weekByPlan = new Map(allPlans.map((p) => [p.id, p.week_start]));
    // Page through the results: the API caps a single response (~1000 rows).
    const planIds = allPlans.map((p) => p.id);
    const PAGE = 1000;
    const daySlots: { meal_plan_id: string; day_of_week: number }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from("meal_plan_entries")
        .select("meal_plan_id, day_of_week")
        .in("meal_plan_id", planIds)
        .order("id")
        .range(from, from + PAGE - 1);
      daySlots.push(...((data ?? []) as typeof daySlots));
      if (!data || data.length < PAGE) break;
    }
    const seen = new Set<string>();
    for (const row of daySlots) {
      const week = weekByPlan.get(row.meal_plan_id);
      if (!week) continue;
      seen.add(addDaysLocal(week, row.day_of_week - 1));
    }
    planDates.push(...seen);
  }

  const resolved = resolvePlanForDate(allPlans, selectedDate);

  type TodayEntries = Parameters<typeof TodayClient>[0]["entries"];
  let entries: TodayEntries = [];
  let statuses: MealEntryStatus[] = [];
  let reviews: MealReview[] = [];
  let planName: string | null = null;

  if (resolved) {
    const { plan, dayOfWeek } = resolved;
    planName = plan.name;

    const { data: entriesData } = await supabase
      .from("meal_plan_entries")
      .select(
        `
        *,
        recipe:recipes_public (
          *,
          recipe_ingredients (
            *,
            ingredient:ingredients_public (*)
          )
        ),
        ingredient:ingredients_public (*)
      `
      )
      .eq("meal_plan_id", plan.id)
      .eq("day_of_week", dayOfWeek);

    entries = (entriesData as TodayEntries | null) ?? [];
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

  // Logged foods for the day (own rows only: RLS "Customer manage own").
  const { data: logData } = await supabase
    .from("food_log_entries")
    .select("*")
    .eq("client_id", profile.client_id)
    .eq("log_date", selectedDate)
    .order("created_at", { ascending: true });
  const logEntries = (logData as FoodLogEntry[] | null) ?? [];

  const isFuture = compareLocalDate(selectedDate, todayStr) > 0;

  return (
    <TodayClient
      planName={planName}
      hasPlans={allPlans.length > 0}
      contactEmail={process.env.NEXT_PUBLIC_TRAINER_EMAIL ?? null}
      selectedDate={selectedDate}
      todayDate={todayStr}
      isFuture={isFuture}
      mealDates={planDates}
      targets={resolveDayTargets(allPlans, clientRow, selectedDate)}
      entries={entries}
      statuses={statuses}
      reviews={reviews}
      logEntries={logEntries}
    />
  );
}
