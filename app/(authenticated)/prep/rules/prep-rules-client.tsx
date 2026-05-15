"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PrepRule, Ingredient, Category } from "@/lib/supabase/types";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import PrepRuleForm from "@/components/prep-rule-form";

const PREP_TYPE_LABELS: Record<string, string> = {
  wash: "Wash", peel: "Peel", chop: "Chop", slice: "Slice", dice: "Dice",
  marinate: "Marinate", portion: "Portion", thaw: "Thaw", soak: "Soak", blanch: "Blanch",
};

interface Props {
  rules: PrepRule[];
  ingredients: Ingredient[];
  categories: Category[];
}

export default function PrepRulesClient({ rules, ingredients, categories }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState<PrepRule | undefined>();
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.slug] = c.name;
    return map;
  }, [categories]);

  const filtered = filterCategory === "all"
    ? rules
    : rules.filter((r) => r.ingredient_category === filterCategory);

  async function handleDelete(id: string) {
    if (!confirm("Delete this prep rule?")) return;
    await supabase.from("prep_rules").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/prep" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Prep Rules</h1>
        </div>
        <button
          onClick={() => { setEditRule(undefined); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" /> Add Rule
        </button>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setFilterCategory("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
            filterCategory === "all" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.slug}
            onClick={() => setFilterCategory(cat.slug)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              filterCategory === cat.slug ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">No prep rules yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">Target</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">Prep Type</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">Days Before</th>
                <th className="px-4 py-3 text-left text-gray-600 font-medium">Time (min)</th>
                <th className="px-4 py-3 text-right text-gray-600 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    {rule.ingredient
                      ? rule.ingredient.name
                      : categoryLabels[rule.ingredient_category ?? ""] ?? rule.ingredient_category}
                    {rule.ingredient && (
                      <span className="ml-1 text-xs text-gray-400">(specific)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">
                      {PREP_TYPE_LABELS[rule.prep_type] ?? rule.prep_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{rule.advance_days}</td>
                  <td className="px-4 py-3 text-gray-500">{rule.time_estimate_minutes ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => { setEditRule(rule); setShowForm(true); }}
                        className="p-1.5 rounded hover:bg-gray-100"
                      >
                        <Pencil className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="p-1.5 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <PrepRuleForm
          rule={editRule}
          ingredients={ingredients}
          categories={categories}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
