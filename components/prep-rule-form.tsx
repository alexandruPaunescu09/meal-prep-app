"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PrepRule, Ingredient, Category, PrepType } from "@/lib/supabase/types";
import { invalidatePrepRules } from "@/lib/actions/revalidate";
import { X } from "lucide-react";

const PREP_TYPES: { value: PrepType; label: string }[] = [
  { value: "wash", label: "Wash" },
  { value: "peel", label: "Peel" },
  { value: "chop", label: "Chop" },
  { value: "slice", label: "Slice" },
  { value: "dice", label: "Dice" },
  { value: "marinate", label: "Marinate" },
  { value: "portion", label: "Portion" },
  { value: "thaw", label: "Thaw" },
  { value: "soak", label: "Soak" },
  { value: "blanch", label: "Blanch" },
];

interface Props {
  rule?: PrepRule;
  ingredients: Ingredient[];
  categories: Category[];
  onClose: () => void;
}

export default function PrepRuleForm({ rule, ingredients, categories, onClose }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [mode, setMode] = useState<"category" | "ingredient">(
    rule?.ingredient_id ? "ingredient" : "category"
  );
  const [form, setForm] = useState({
    ingredient_category: (rule?.ingredient_category ?? "vegetables") as string,
    ingredient_id: rule?.ingredient_id ?? "",
    prep_type: rule?.prep_type ?? ("chop" as string),
    advance_days: rule?.advance_days ?? 1,
    time_estimate_minutes: rule?.time_estimate_minutes ?? (null as number | null),
    notes: rule?.notes ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      ingredient_category: mode === "category" ? form.ingredient_category : null,
      ingredient_id: mode === "ingredient" ? form.ingredient_id || null : null,
      prep_type: form.prep_type,
      advance_days: form.advance_days,
      time_estimate_minutes: form.time_estimate_minutes,
      notes: form.notes || null,
    };

    if (mode === "ingredient" && !payload.ingredient_id) {
      setError("Please select an ingredient");
      setSaving(false);
      return;
    }

    const result = rule
      ? await supabase.from("prep_rules").update(payload).eq("id", rule.id)
      : await supabase.from("prep_rules").insert(payload);

    if (result.error) {
      setError(result.error.message);
      setSaving(false);
    } else {
      await invalidatePrepRules();
      router.refresh();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {rule ? "Edit Prep Rule" : "Add Prep Rule"}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Apply to</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("category")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                  mode === "category" ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-500" : "bg-gray-100 text-gray-600"
                }`}
              >
                Category
              </button>
              <button
                type="button"
                onClick={() => setMode("ingredient")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                  mode === "ingredient" ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-500" : "bg-gray-100 text-gray-600"
                }`}
              >
                Specific Ingredient
              </button>
            </div>
          </div>

          {mode === "category" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={form.ingredient_category}
                onChange={(e) => setForm({ ...form, ingredient_category: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm"
              >
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ingredient</label>
              <select
                value={form.ingredient_id}
                onChange={(e) => setForm({ ...form, ingredient_id: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm"
              >
                <option value="">Select ingredient...</option>
                {ingredients.map((ing) => (
                  <option key={ing.id} value={ing.id}>{ing.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prep Type</label>
            <select
              value={form.prep_type}
              onChange={(e) => setForm({ ...form, prep_type: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm"
            >
              {PREP_TYPES.map((pt) => (
                <option key={pt.value} value={pt.value}>{pt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Days Before Cooking
            </label>
            <input
              type="number"
              min={0}
              max={6}
              value={form.advance_days}
              onChange={(e) => setForm({ ...form, advance_days: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              0 = prep on cooking day, 1 = prep the day before, etc.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Time Estimate (minutes, optional)
            </label>
            <input
              type="number"
              min={1}
              value={form.time_estimate_minutes ?? ""}
              onChange={(e) => setForm({ ...form, time_estimate_minutes: e.target.value === "" ? null : parseInt(e.target.value) })}
              placeholder="Per batch"
              className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="e.g., Store in airtight container"
              className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            {saving ? "Saving..." : rule ? "Update Rule" : "Add Rule"}
          </button>
        </form>
      </div>
    </div>
  );
}
