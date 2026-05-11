import { createServer } from "@/lib/supabase/server";
import Link from "next/link";

export default async function DashboardPage() {
  const supabase = await createServer();

  const [ingredients, recipes, mealPlans, clients] = await Promise.all([
    supabase.from("ingredients").select("id", { count: "exact", head: true }),
    supabase.from("recipes").select("id", { count: "exact", head: true }),
    supabase.from("meal_plans").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id", { count: "exact", head: true }),
  ]);

  const stats = [
    {
      label: "Ingredients",
      value: ingredients.count ?? 0,
      href: "/ingredients",
      color: "text-emerald-700",
      bg: "bg-emerald-50",
    },
    {
      label: "Recipes",
      value: recipes.count ?? 0,
      href: "/recipes",
      color: "text-blue-700",
      bg: "bg-blue-50",
    },
    {
      label: "Meal Plans",
      value: mealPlans.count ?? 0,
      href: "/meal-plans",
      color: "text-purple-700",
      bg: "bg-purple-50",
    },
    {
      label: "Clients",
      value: clients.count ?? 0,
      href: "/clients",
      color: "text-amber-700",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Overview of your meal prep business.
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow"
          >
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className={`mt-1 text-3xl font-bold ${stat.color}`}>
              {stat.value}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Quick Actions
          </h2>
          <div className="space-y-2">
            <Link
              href="/ingredients"
              className="block px-4 py-2.5 rounded-lg bg-gray-50 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              Add new ingredient
            </Link>
            <Link
              href="/recipes"
              className="block px-4 py-2.5 rounded-lg bg-gray-50 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              Create a recipe
            </Link>
            <Link
              href="/meal-plans"
              className="block px-4 py-2.5 rounded-lg bg-gray-50 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              Build a meal plan
            </Link>
            <Link
              href="/clients"
              className="block px-4 py-2.5 rounded-lg bg-gray-50 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              Add a client
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Workflow
          </h2>
          <ol className="space-y-2 text-sm text-gray-600">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span>Add ingredients with prices and nutrition data</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                2
              </span>
              <span>Build recipes from your ingredients</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                3
              </span>
              <span>Create weekly meal plans with your recipes</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                4
              </span>
              <span>Generate shareable images for your clients</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
