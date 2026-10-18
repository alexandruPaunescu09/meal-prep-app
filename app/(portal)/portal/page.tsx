import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  MealEntryStatus,
  MealPlan,
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

  const { data: clientRow } = await supabase
    .from("clients")
    .select("calorie_target")
    .eq("id", profile.client_id)
    .maybeSingle();
  const calorieTarget: number | null = clientRow?.calorie_target ?? null;

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

  // YYYY-MM-DD dates that actually have meals (a plan covering a week with no
  // entries on a given day shouldn't be marked or offered as a destination).
  const planDates: string[] = [];
  if (allPlans.length > 0) {
    const weekByPlan = new Map(allPlans.map((p) => [p.id, p.week_start]));
    const { data: daySlots } = await supabase
      .from("meal_plan_entries")
      .select("meal_plan_id, day_of_week")
      .in("meal_plan_id", allPlans.map((p) => p.id));
    const seen = new Set<string>();
    for (const row of (daySlots ?? []) as { meal_plan_id: string; day_of_week: number }[]) {
      const week = weekByPlan.get(row.meal_plan_id);
      if (!week) continue;
      seen.add(addDaysLocal(week, row.day_of_week - 1));
    }
    planDates.push(...seen);
  }

  if (allPlans.length === 0) {
    const contactEmail = process.env.NEXT_PUBLIC_TRAINER_EMAIL ?? null;
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900">Welcome</h1>
        <div className="bg-white rounded-2xl border p-6 space-y-4">
          <div>
            <p className="text-gray-900 font-medium">
              Your meal plan is being prepared.
            </p>
            <p className="text-sm text-gray-600 mt-1">
              As soon as it&apos;s ready, we&apos;ll publish it here and your
              meals for each day will show up on this page.
            </p>
          </div>
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900">
              While you wait
            </p>
            <p className="mt-1">
              Check that your allergies and food preferences are correct so
              your plan fits you.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/portal/profile"
              className="inline-flex items-center px-4 py-2 min-h-[44px] bg-emerald-600 text-white rounded-lg text-sm font-medium"
            >
              Review my profile
            </Link>
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}`}
                className="inline-flex items-center px-4 py-2 min-h-[44px] border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Contact us
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }

  const resolved = resolvePlanForDate(allPlans, selectedDate);

  type TodayEntries = Parameters<typeof TodayClient>[0]["entries"];
  let entries: TodayEntries = [];
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

  const isFuture = compareLocalDate(selectedDate, todayStr) > 0;

  return (
    <TodayClient
      planId={planId}
      planName={planName}
      selectedDate={selectedDate}
      todayDate={todayStr}
      isFuture={isFuture}
      planDates={planDates}
      calorieTarget={resolved?.plan.calorie_target ?? calorieTarget}
      entries={entries}
      statuses={statuses}
      reviews={reviews}
    />
  );
}
