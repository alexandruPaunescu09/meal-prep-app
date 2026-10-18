import Link from "next/link";
import {
  Carrot,
  CookingPot,
  CalendarDays,
  Users,
  Star,
  AlertTriangle,
  Package,
  ClipboardList,
  ScanBarcode,
  Receipt,
  Plus,
  CheckCircle2,
  Circle,
  ChevronRight,
} from "lucide-react";
import { getDashboardData } from "@/lib/data/dashboard";
import { currentWeekStart, nextWeekStart, formatWeekRange } from "@/lib/format";

export default async function DashboardPage() {
  const thisWeek = currentWeekStart();
  const nextWeek = nextWeekStart();
  const d = await getDashboardData(thisWeek, nextWeek);

  const stats = [
    { label: "Ingredients", value: d.counts.ingredients, href: "/ingredients", icon: Carrot, color: "text-emerald-700", bg: "bg-emerald-50" },
    { label: "Recipes", value: d.counts.recipes, href: "/recipes", icon: CookingPot, color: "text-blue-700", bg: "bg-blue-50" },
    { label: "Meal Plans", value: d.counts.mealPlans, href: "/meal-plans", icon: CalendarDays, color: "text-purple-700", bg: "bg-purple-50" },
    { label: "Clients", value: d.counts.clients, href: "/clients", icon: Users, color: "text-amber-700", bg: "bg-amber-50" },
  ];

  const attention = [
    { label: "unread reviews", n: d.attention.unreadReviews, href: "/reviews", icon: Star },
    { label: "ingredients without a price", n: d.attention.ingredientsNoPrice, href: "/ingredients", icon: Carrot },
    { label: "ingredients without nutrition data", n: d.attention.ingredientsNoNutrition, href: "/ingredients", icon: Carrot },
    { label: "recipes without a container type", n: d.attention.recipesNoContainer, href: "/recipes", icon: Package },
  ].filter((a) => a.n > 0);

  const actions = [
    { label: "Add ingredient", href: "/ingredients?new=1", icon: Plus },
    { label: "Scan barcode", href: "/ingredients?scan=1", icon: ScanBarcode },
    { label: "Import receipt", href: "/ingredients/import", icon: Receipt },
    { label: "Create recipe", href: "/recipes?new=1", icon: CookingPot },
    { label: "Add client", href: "/clients?new=1", icon: Users },
    { label: "Build a meal plan", href: "/meal-plans", icon: CalendarDays },
  ];

  const checklist = [
    { label: "Add ingredients with prices and nutrition", done: d.counts.ingredients > 0, href: "/ingredients" },
    { label: "Build recipes from your ingredients", done: d.counts.recipes > 0, href: "/recipes" },
    { label: "Add your clients", done: d.counts.clients > 0, href: "/clients" },
    { label: "Create a weekly meal plan", done: d.counts.mealPlans > 0, href: "/meal-plans" },
    { label: "Set up prep rules", done: d.counts.prepRules > 0, href: "/prep" },
    { label: "Add container types and track deliveries", done: d.counts.containerTypes > 0, href: "/containers" },
    { label: "Review customer feedback as it arrives", done: d.attention.unreadReviews > 0 ? false : d.counts.clients > 0, href: "/reviews" },
  ];
  const showChecklist = Object.values(d.counts).some((c) => c === 0);

  const prepPct = d.prep.total > 0 ? Math.round((d.prep.done / d.prep.total) * 100) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Overview of your meal prep business.
      </p>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white rounded-xl border p-4 sm:p-5 hover:shadow-sm transition-shadow flex items-center gap-3"
          >
            <span className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color}`}>
              <stat.icon className="w-5 h-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-medium text-gray-500">{stat.label}</span>
              <span className={`block text-2xl font-bold ${stat.color}`}>{stat.value}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border p-5" aria-labelledby="attention-h">
          <h2 id="attention-h" className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden="true" />
            Needs attention
          </h2>
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              All caught up.
            </p>
          ) : (
            <ul className="space-y-2">
              {attention.map((a) => (
                <li key={a.label}>
                  <Link
                    href={a.href}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-amber-50 text-sm text-gray-800 hover:bg-amber-100 transition-colors"
                  >
                    <a.icon className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                    <span className="flex-1">
                      <strong className="font-semibold">{a.n}</strong> {a.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white rounded-xl border p-5" aria-labelledby="week-h">
          <h2 id="week-h" className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-purple-600" aria-hidden="true" />
            This week
          </h2>
          <ul className="space-y-2 text-sm">
            {[
              { label: "This week", week: thisWeek, n: d.plansThisWeek },
              { label: "Next week", week: nextWeek, n: d.plansNextWeek },
            ].map((w) => (
              <li key={w.week}>
                <Link
                  href={`/meal-plans?week=${w.week}`}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-50 text-gray-800 hover:bg-emerald-50 transition-colors"
                >
                  <span className="flex-1">
                    <span className="font-medium">{w.label}</span>{" "}
                    <span className="text-gray-500">({formatWeekRange(w.week)})</span>
                    <span className="block text-gray-600">
                      {w.n === 0 ? "No meal plans yet" : `${w.n} meal plan${w.n === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/prep"
                className="block px-4 py-2.5 rounded-lg bg-gray-50 text-gray-800 hover:bg-emerald-50 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <ClipboardList className="w-4 h-4 text-gray-500 shrink-0" aria-hidden="true" />
                  <span className="flex-1">
                    Prep tasks:{" "}
                    {d.prep.total === 0
                      ? "none scheduled"
                      : `${d.prep.done} of ${d.prep.total} done`}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" aria-hidden="true" />
                </span>
                {d.prep.total > 0 && (
                  <span
                    className="mt-2 block h-1.5 rounded-full bg-gray-200 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={prepPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Prep progress this week"
                  >
                    <span className="block h-full bg-emerald-500" style={{ width: `${prepPct}%` }} />
                  </span>
                )}
              </Link>
            </li>
          </ul>
        </section>

        <section className="bg-white rounded-xl border p-5" aria-labelledby="actions-h">
          <h2 id="actions-h" className="text-sm font-semibold text-gray-700 mb-3">
            Quick actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {actions.map((a) => (
              <Link
                key={a.label}
                href={a.href}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-gray-50 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
              >
                <a.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {a.label}
              </Link>
            ))}
          </div>
        </section>

        {showChecklist && (
          <section className="bg-white rounded-xl border p-5" aria-labelledby="start-h">
            <h2 id="start-h" className="text-sm font-semibold text-gray-700 mb-3">
              Getting started
            </h2>
            <ul className="space-y-2 text-sm">
              {checklist.map((step) => (
                <li key={step.label}>
                  <Link
                    href={step.href}
                    className={`flex items-center gap-3 hover:underline ${
                      step.done ? "text-gray-400" : "text-gray-700"
                    }`}
                  >
                    {step.done ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden="true" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300 shrink-0" aria-hidden="true" />
                    )}
                    <span className={step.done ? "line-through" : ""}>{step.label}</span>
                    <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
