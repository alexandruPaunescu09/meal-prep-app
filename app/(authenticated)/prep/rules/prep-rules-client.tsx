"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PrepRule, Ingredient, Category } from "@/lib/supabase/types";
import { invalidatePrepRules } from "@/lib/actions/revalidate";
import { Plus, Pencil, Trash2, ArrowLeft, Search } from "lucide-react";
import Link from "next/link";
import PrepRuleForm from "@/components/prep-rule-form";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";

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
  const toast = useToast();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState<PrepRule | undefined>();
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.slug] = c.name;
    return map;
  }, [categories]);

  function targetLabel(rule: PrepRule): string {
    return rule.ingredient
      ? rule.ingredient.name
      : categoryLabels[rule.ingredient_category ?? ""] ?? rule.ingredient_category ?? "—";
  }

  const q = query.trim().toLowerCase();
  const filtered = rules.filter((r) => {
    if (filterCategory !== "all" && r.ingredient_category !== filterCategory) return false;
    if (!q) return true;
    return (
      targetLabel(r).toLowerCase().includes(q) ||
      (PREP_TYPE_LABELS[r.prep_type] ?? r.prep_type).toLowerCase().includes(q) ||
      (r.notes ?? "").toLowerCase().includes(q)
    );
  });

  async function handleDelete(rule: PrepRule) {
    const label = targetLabel(rule);
    const ok = await confirm({
      title: "Delete prep rule?",
      message: `“${label}” (${PREP_TYPE_LABELS[rule.prep_type] ?? rule.prep_type}) will stop generating prep tasks. Tasks already generated are not changed.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;

    const { error } = await supabase.from("prep_rules").delete().eq("id", rule.id);
    if (error) {
      toast.error(`Could not delete prep rule: ${error.message}`);
      return;
    }
    toast.success("Prep rule deleted");
    await invalidatePrepRules();
    router.refresh();
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link
            href="/prep"
            aria-label="Back to prep schedule"
            title="Back to prep schedule"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Prep Rules</h1>
        </div>
        <button
          onClick={() => { setEditRule(undefined); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" /> Add rule
        </button>
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by ingredient, category, prep type or notes"
          aria-label="Search prep rules"
          className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm text-gray-900 bg-white"
        />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setFilterCategory("all")}
          aria-pressed={filterCategory === "all"}
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
            aria-pressed={filterCategory === cat.slug}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
              filterCategory === cat.slug ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white rounded-xl border">
          <p className="text-gray-500">
            {rules.length === 0
              ? "No prep rules yet. Add one to get started."
              : "No prep rules match your search or filter."}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: card list */}
          <ul className="md:hidden space-y-2">
            {filtered.map((rule) => (
              <li key={rule.id} className="bg-white rounded-xl border p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {targetLabel(rule)}
                    {rule.ingredient && <span className="ml-1 text-xs text-gray-400">(specific)</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-600">
                    <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">
                      {PREP_TYPE_LABELS[rule.prep_type] ?? rule.prep_type}
                    </span>
                    <span>{rule.advance_days} day{rule.advance_days === 1 ? "" : "s"} before</span>
                    {rule.time_estimate_minutes != null && <span>{rule.time_estimate_minutes} min</span>}
                  </div>
                  {rule.notes && <p className="text-xs text-gray-500 mt-1">{rule.notes}</p>}
                </div>
                <div className="flex shrink-0 -my-1">
                  <IconButton label={`Edit prep rule for ${targetLabel(rule)}`} tone="primary" onClick={() => { setEditRule(rule); setShowForm(true); }}>
                    <Pencil size={16} />
                  </IconButton>
                  <IconButton label={`Delete prep rule for ${targetLabel(rule)}`} tone="danger" onClick={() => handleDelete(rule)}>
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-gray-600 font-medium">Target</th>
                  <th scope="col" className="px-4 py-3 text-left text-gray-600 font-medium">Prep type</th>
                  <th scope="col" className="px-4 py-3 text-left text-gray-600 font-medium">Days before</th>
                  <th scope="col" className="px-4 py-3 text-left text-gray-600 font-medium">Time (min)</th>
                  <th scope="col" className="px-4 py-3 text-right text-gray-600 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {targetLabel(rule)}
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
                        <IconButton label={`Edit prep rule for ${targetLabel(rule)}`} tone="primary" onClick={() => { setEditRule(rule); setShowForm(true); }}>
                          <Pencil size={16} />
                        </IconButton>
                        <IconButton label={`Delete prep rule for ${targetLabel(rule)}`} tone="danger" onClick={() => handleDelete(rule)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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
