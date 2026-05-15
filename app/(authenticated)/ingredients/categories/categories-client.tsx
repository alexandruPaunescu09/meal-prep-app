"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Category } from "@/lib/supabase/types";
import { Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";

interface Props {
  categories: Category[];
  ingredientCounts: Record<string, number>;
}

export default function CategoriesClient({ categories, ingredientCounts }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [showForm, setShowForm] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formName, setFormName] = useState("");

  function openAdd() {
    setEditCategory(undefined);
    setFormName("");
    setError("");
    setShowForm(true);
  }

  function openEdit(cat: Category) {
    setEditCategory(cat);
    setFormName(cat.name);
    setError("");
    setShowForm(true);
  }

  function slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setSaving(true);
    setError("");

    if (editCategory) {
      const { error: err } = await supabase
        .from("ingredient_categories")
        .update({ name: formName.trim() })
        .eq("id", editCategory.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const slug = slugify(formName);
      if (!slug) { setError("Invalid name"); setSaving(false); return; }
      const maxOrder = categories.length > 0
        ? Math.max(...categories.map((c) => c.sort_order))
        : 0;
      const { error: err } = await supabase
        .from("ingredient_categories")
        .insert({ slug, name: formName.trim(), sort_order: maxOrder + 1 });
      if (err) {
        setError(err.message.includes("duplicate") ? "A category with this name already exists" : err.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowForm(false);
    router.refresh();
  }

  async function handleDelete(cat: Category) {
    const count = ingredientCounts[cat.slug] ?? 0;
    if (count > 0) {
      alert(`Cannot delete "${cat.name}" — ${count} ingredient(s) still use this category. Reassign them first.`);
      return;
    }
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    await supabase.from("ingredient_categories").delete().eq("id", cat.id);
    router.refresh();
  }

  async function moveUp(cat: Category, index: number) {
    if (index === 0) return;
    const prev = categories[index - 1];
    await Promise.all([
      supabase.from("ingredient_categories").update({ sort_order: prev.sort_order }).eq("id", cat.id),
      supabase.from("ingredient_categories").update({ sort_order: cat.sort_order }).eq("id", prev.id),
    ]);
    router.refresh();
  }

  async function moveDown(cat: Category, index: number) {
    if (index === categories.length - 1) return;
    const next = categories[index + 1];
    await Promise.all([
      supabase.from("ingredient_categories").update({ sort_order: next.sort_order }).eq("id", cat.id),
      supabase.from("ingredient_categories").update({ sort_order: cat.sort_order }).eq("id", next.id),
    ]);
    router.refresh();
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/ingredients" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage ingredient categories</p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
        >
          <Plus className="w-4 h-4" /> Add Category
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-gray-600 font-medium w-10"></th>
              <th className="px-4 py-3 text-left text-gray-600 font-medium">Name</th>
              <th className="px-4 py-3 text-left text-gray-600 font-medium">Slug</th>
              <th className="px-4 py-3 text-right text-gray-600 font-medium">Ingredients</th>
              <th className="px-4 py-3 text-right text-gray-600 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.map((cat, index) => (
              <tr key={cat.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveUp(cat, index)}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveDown(cat, index)}
                      disabled={index === categories.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
                    >
                      ▼
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{cat.name}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{cat.slug}</td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {ingredientCounts[cat.slug] ?? 0}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => openEdit(cat)}
                      className="p-1.5 rounded hover:bg-gray-100"
                    >
                      <Pencil className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
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

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {editCategory ? "Rename Category" : "Add Category"}
              </h2>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Spices"
                  className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                  autoFocus
                  required
                />
                {!editCategory && formName.trim() && (
                  <p className="mt-1 text-xs text-gray-400">
                    Slug: {slugify(formName)}
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 px-4 border text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formName.trim()}
                  className="flex-1 py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
                >
                  {saving ? "Saving..." : editCategory ? "Rename" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
