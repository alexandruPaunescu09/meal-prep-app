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
  dayOfWeekIndex,
  formatLocalDate,
  mondayOfWeek,
} from "@/lib/portal/entry-helpers";
import TodayClient from "./today-client";
import Link from "next/link";

export default async function PortalTodayPage() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.client_id) redirect("/login");

  const today = new Date();
  const todayStr = formatLocalDate(today);
  const monday = mondayOfWeek(today);
  const dow = dayOfWeekIndex(today); // 1..7

  // Find plans for this client that cover today (week_start <= today, week_start+6 >= today)
  const earliestStart = addDaysLocal(todayStr, -6);
  const { data: plans } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("client_id", profile.client_id)
    .gte("week_start", earliestStart)
    .lte("week_start", todayStr)
    .order("week_start", { ascending: false });

  const activePlan = (plans ?? []).find(
    (p: MealPlan) => p.week_start === monday
  ) ?? (plans as MealPlan[])?.[0] ?? null;

  if (!activePlan) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900">
          Today, {today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        </h1>
        <div className="bg-white rounded-2xl border p-6 text-center">
          <p className="text-gray-700 font-medium">No plan covers today yet.</p>
          <p className="text-sm text-gray-500 mt-1">
            Your trainer will share a plan when it's ready.
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

  const planDow = dayOfWeekIndex(today); // entry day_of_week to fetch
  const planMonday = activePlan.week_start;
  const dayOffset = Math.round(
    (new Date(todayStr).getTime() - new Date(planMonday).getTime()) / 86400000
  );
  const targetDow = dayOffset + 1;

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
      ),
      ingredient:ingredients (*)
    `)
    .eq("meal_plan_id", activePlan.id)
    .eq("day_of_week", targetDow);

  const entryIds = (entries ?? []).map((e: MealPlanEntry) => e.id);

  const [statusesRes, reviewsRes] = await Promise.all([
    entryIds.length
      ? supabase.from("meal_entry_status").select("*").in("meal_plan_entry_id", entryIds)
      : Promise.resolve({ data: [] }),
    entryIds.length
      ? supabase.from("meal_reviews").select("*").in("meal_plan_entry_id", entryIds)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <TodayClient
      planId={activePlan.id}
      planName={activePlan.name}
      sellingPriceMarkup={activePlan.markup_multiplier}
      todayStr={todayStr}
      entries={(entries as any[]) ?? []}
      statuses={(statusesRes.data as MealEntryStatus[]) ?? []}
      reviews={(reviewsRes.data as MealReview[]) ?? []}
    />
  );
}
