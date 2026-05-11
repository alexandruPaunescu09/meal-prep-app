"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { MealPlan, Client } from "@/lib/supabase/types";
import { Plus, Trash2, Calendar, X } from "lucide-react";

type MealPlanWithClient = MealPlan & { client: Client | null };

export default function MealPlansClient({
  mealPlans,
  clients,
}: {
  mealPlans: MealPlanWithClient[];
  clients: Client[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [showForm, setShowForm] = useState(false);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await supabase.from("meal_plans").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meal Plans</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mealPlans.length} plan{mealPlans.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          New Plan
        </button>
      </div>

      {mealPlans.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No meal plans yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Create your first meal plan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mealPlans.map((plan) => (
            <div
              key={plan.id}
              className="bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow cursor-pointer"
              onClick={() => router.push(`/meal-plans/${plan.id}`)}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                    <Calendar className="w-3 h-3" />
                    <span>Week of {plan.week_start}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(plan.id, plan.name);
                  }}
                  className="p-1.5 rounded hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
              {plan.client && (
                <p className="text-sm text-gray-600">
                  Client: {plan.client.name}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Markup: {plan.markup_multiplier}×
              </p>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <NewPlanForm clients={clients} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}

function NewPlanForm({
  clients,
  onClose,
}: {
  clients: Client[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const defaultWeekStart = monday.toISOString().split("T")[0];

  const [form, setForm] = useState({
    name: "",
    client_id: "" as string,
    week_start: defaultWeekStart,
    markup_multiplier: 2.5,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const { data, error: createErr } = await supabase
      .from("meal_plans")
      .insert({
        name: form.name.trim(),
        client_id: form.client_id || null,
        week_start: form.week_start,
        markup_multiplier: form.markup_multiplier,
      })
      .select("id")
      .single();

    if (createErr || !data) {
      setError(createErr?.message ?? "Failed to create plan");
      setSaving(false);
      return;
    }

    router.push(`/meal-plans/${data.id}`);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">New Meal Plan</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plan Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Week 1 - Mihai"
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client
            </label>
            <select
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Week Start (Monday)
            </label>
            <input
              type="date"
              value={form.week_start}
              onChange={(e) => setForm({ ...form, week_start: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Markup Multiplier
            </label>
            <input
              type="number"
              step="0.1"
              min={1}
              value={form.markup_multiplier}
              onChange={(e) =>
                setForm({
                  ...form,
                  markup_multiplier: parseFloat(e.target.value) || 1,
                })
              }
              className="w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Selling price = ingredient cost × multiplier
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
            >
              {saving ? "Creating..." : "Create Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
