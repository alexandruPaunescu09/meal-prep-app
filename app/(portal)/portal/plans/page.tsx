import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { mondayOfWeek } from "@/lib/portal/entry-helpers";
import { portalToday } from "@/lib/portal/today";
import { formatWeekRange } from "@/lib/format";
import { MealPlan } from "@/lib/supabase/types";

export default async function PortalPlansPage() {
  const supabase = await createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.client_id) redirect("/login");

  const { data: plans } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("client_id", profile.client_id)
    .order("week_start", { ascending: false });

  const currentMonday = mondayOfWeek(await portalToday());

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-gray-900">Your plans</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {(plans?.length ?? 0)} plan{(plans?.length ?? 0) === 1 ? "" : "s"}
        </p>
      </header>

      {(!plans || plans.length === 0) && (
        <div className="bg-white rounded-2xl border p-6 text-center text-sm text-gray-500">
          No plans yet. Your trainer will share one soon.
        </div>
      )}

      <ul className="space-y-3">
        {(plans as MealPlan[] | null)?.map((plan) => {
          const isCurrent = plan.week_start === currentMonday;
          const isPast = plan.week_start < currentMonday;
          const isFuture = plan.week_start > currentMonday;
          return (
            <li key={plan.id}>
              <Link
                href={`/portal/plans/${plan.id}`}
                className={`block rounded-2xl border p-4 transition-colors active:bg-gray-50 ${
                  isCurrent
                    ? "bg-emerald-50/40 border-emerald-300 hover:border-emerald-400"
                    : "bg-white border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                      {isCurrent && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white font-medium">
                          This week
                        </span>
                      )}
                      {isFuture && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                          Upcoming
                        </span>
                      )}
                      {isPast && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                          Past
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {formatWeekRange(plan.week_start)}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
