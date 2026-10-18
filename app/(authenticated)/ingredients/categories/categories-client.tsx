"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Category } from "@/lib/supabase/types";
import { invalidateCategories, invalidatePrepRules } from "@/lib/actions/revalidate";
import { Plus, Pencil, Trash2, ArrowLeft, ChevronUp, ChevronDown } from "lucide-react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { IconButton } from "@/components/ui/icon-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

interface Props {
  categories: Category[];
  ingredientCounts: Record<string, number>;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function friendlyError(message: string): string {
  return message.includes("duplicate")
    ? "A category with this name already exists"
    : message;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default function CategoriesClient({ categories, ingredientCounts }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const confirm = useConfirm();
  const toast = useToast();
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Local copy of the list so reorders show instantly and can be rolled back.
  const [items, setItems] = useState<Category[]>(categories);
  const [syncedFrom, setSyncedFrom] = useState<Category[]>(categories);
  if (categories !== syncedFrom) {
    // Adjust state during render when fresh server props arrive.
    setSyncedFrom(categories);
    setItems(categories);
  }

  // Add / rename modal
  const [showForm, setShowForm] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formName, setFormName] = useState("");
  const [originalName, setOriginalName] = useState("");

  // Reorder
  const [reordering, setReordering] = useState(false);

  // Delete-with-ingredients modal
  const [moveTarget, setMoveTarget] = useState<Category | null>(null);
  const [moveToSlug, setMoveToSlug] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState("");

  const otherCategories = moveTarget
    ? items.filter((c) => c.id !== moveTarget.id)
    : [];

  function openAdd() {
    setEditCategory(undefined);
    setFormName("");
    setOriginalName("");
    setError("");
    setShowForm(true);
  }

  function openEdit(cat: Category) {
    setEditCategory(cat);
    setFormName(cat.name);
    setOriginalName(cat.name);
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = formName.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError("");

    if (editCategory) {
      const { error: err } = await supabase
        .from("ingredient_categories")
        .update({ name: trimmed })
        .eq("id", editCategory.id);
      if (err) {
        setError(friendlyError(err.message));
        setSaving(false);
        toast.error(`Could not rename category: ${friendlyError(err.message)}`);
        return;
      }
      toast.success(`Renamed to "${trimmed}"`);
    } else {
      const slug = slugify(trimmed);
      if (!slug) {
        setError("Invalid name");
        setSaving(false);
        return;
      }
      const maxOrder = items.length > 0
        ? Math.max(...items.map((c) => c.sort_order))
        : 0;
      const { error: err } = await supabase
        .from("ingredient_categories")
        .insert({ slug, name: trimmed, sort_order: maxOrder + 1 });
      if (err) {
        setError(friendlyError(err.message));
        setSaving(false);
        toast.error(`Could not add category: ${friendlyError(err.message)}`);
        return;
      }
      toast.success(`Added "${trimmed}"`);
    }

    setSaving(false);
    setShowForm(false);
    await invalidateCategories();
    router.refresh();
  }

  async function handleDelete(cat: Category) {
    const count = ingredientCounts[cat.slug] ?? 0;
    if (count > 0) {
      // Offer to move the ingredients first (see the move modal below).
      const others = items.filter((c) => c.id !== cat.id);
      setMoveTarget(cat);
      setMoveToSlug(others[0]?.slug ?? "");
      setMoveError("");
      return;
    }

    const { count: ruleCount, error: ruleCountErr } = await supabase
      .from("prep_rules")
      .select("id", { count: "exact", head: true })
      .eq("ingredient_category", cat.slug);
    if (ruleCountErr) {
      toast.error(`Could not check prep rules for "${cat.name}": ${ruleCountErr.message}`);
      return;
    }
    const rulesUsing = ruleCount ?? 0;

    const ok = await confirm({
      title: `Delete "${cat.name}"?`,
      message: rulesUsing > 0
        ? `This category has no ingredients. ${rulesUsing} ${rulesUsing === 1 ? "prep rule uses" : "prep rules use"} this category and will be removed. This cannot be undone.`
        : "This category has no ingredients. This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;

    if (rulesUsing > 0) {
      const { error: rulesErr } = await supabase
        .from("prep_rules")
        .delete()
        .eq("ingredient_category", cat.slug);
      if (rulesErr) {
        toast.error(`Could not remove prep rules for "${cat.name}": ${rulesErr.message}`);
        return;
      }
      await invalidatePrepRules();
    }

    const { error: err } = await supabase
      .from("ingredient_categories")
      .delete()
      .eq("id", cat.id);
    if (err) {
      toast.error(`Could not delete "${cat.name}": ${err.message}`);
      return;
    }
    toast.success(`Deleted "${cat.name}"`);
    await invalidateCategories();
    router.refresh();
  }

  async function handleMoveAndDelete() {
    if (!moveTarget || !moveToSlug || moving) return;
    const cat = moveTarget;
    const count = ingredientCounts[cat.slug] ?? 0;
    const targetName = items.find((c) => c.slug === moveToSlug)?.name ?? moveToSlug;

    setMoving(true);
    setMoveError("");

    const { error: updErr } = await supabase
      .from("ingredients")
      .update({ category: moveToSlug })
      .eq("category", cat.slug);
    if (updErr) {
      setMoveError(updErr.message);
      setMoving(false);
      toast.error(`Could not move ingredients: ${updErr.message}`);
      return;
    }

    // Repoint prep rules so they follow the ingredients instead of orphaning.
    // Rules identical to one the target category already has (same prep type
    // and lead time) are dropped instead of repointed, so no duplicates appear.
    const { data: catRules, error: loadRulesErr } = await supabase
      .from("prep_rules")
      .select("id, ingredient_category, prep_type, advance_days")
      .in("ingredient_category", [cat.slug, moveToSlug]);
    let rulesErr = loadRulesErr;
    if (!rulesErr) {
      const targetKeys = new Set(
        (catRules ?? [])
          .filter((r) => r.ingredient_category === moveToSlug)
          .map((r) => `${r.prep_type}|${r.advance_days}`)
      );
      const dupIds = (catRules ?? [])
        .filter(
          (r) =>
            r.ingredient_category === cat.slug &&
            targetKeys.has(`${r.prep_type}|${r.advance_days}`)
        )
        .map((r) => r.id);
      if (dupIds.length > 0) {
        const { error } = await supabase.from("prep_rules").delete().in("id", dupIds);
        rulesErr = error;
      }
    }
    if (!rulesErr) {
      const { error } = await supabase
        .from("prep_rules")
        .update({ ingredient_category: moveToSlug })
        .eq("ingredient_category", cat.slug);
      rulesErr = error;
    }
    if (rulesErr) {
      // Ingredients have moved, but the category is kept so the rules still resolve.
      await invalidateCategories();
      await invalidatePrepRules();
      setMoveError(rulesErr.message);
      setMoving(false);
      router.refresh();
      toast.error(
        `Moved ${plural(count, "ingredient")} to "${targetName}", but prep rules could not be updated and "${cat.name}" was kept: ${rulesErr.message}`
      );
      return;
    }
    await invalidatePrepRules();

    const { error: delErr } = await supabase
      .from("ingredient_categories")
      .delete()
      .eq("id", cat.id);

    // Ingredients have already moved, so refresh caches whatever happens next.
    await invalidateCategories();
    setMoving(false);
    setMoveTarget(null);
    router.refresh();

    if (delErr) {
      toast.error(
        `Moved ${plural(count, "ingredient")} to "${targetName}", but "${cat.name}" could not be deleted: ${delErr.message}`
      );
      return;
    }
    toast.success(`Moved ${plural(count, "ingredient")} to "${targetName}" and deleted "${cat.name}"`);
  }

  async function move(index: number, direction: -1 | 1) {
    const j = index + direction;
    if (reordering || j < 0 || j >= items.length) return;
    const a = items[index];
    const b = items[j];
    const snapshot = items;

    const next = [...items];
    next[index] = { ...b, sort_order: a.sort_order };
    next[j] = { ...a, sort_order: b.sort_order };
    setItems(next);
    setReordering(true);

    const results = await Promise.all([
      supabase.from("ingredient_categories").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("ingredient_categories").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    const failed = results.find((r) => r.error)?.error;

    if (failed) {
      // Restore both rows so the stored order matches what the user sees.
      const rollback = await Promise.all([
        supabase.from("ingredient_categories").update({ sort_order: a.sort_order }).eq("id", a.id),
        supabase.from("ingredient_categories").update({ sort_order: b.sort_order }).eq("id", b.id),
      ]);
      setItems(snapshot);
      setReordering(false);
      const rollbackFailed = rollback.some((r) => r.error);
      toast.error(
        rollbackFailed
          ? `Could not reorder "${a.name}" and "${b.name}". The order may be out of sync; reload the page.`
          : `Could not reorder: ${failed.message}`
      );
      return;
    }

    setReordering(false);
    toast.success(`Moved "${a.name}" ${direction < 0 ? "up" : "down"}`);
    await invalidateCategories();
    router.refresh();
  }

  function renderActions(cat: Category, index: number) {
    return (
      <div className="flex items-center justify-end gap-1">
        <IconButton
          label={`Move ${cat.name} up`}
          onClick={() => move(index, -1)}
          disabled={index === 0 || reordering}
        >
          <ChevronUp className="w-4 h-4" />
        </IconButton>
        <IconButton
          label={`Move ${cat.name} down`}
          onClick={() => move(index, 1)}
          disabled={index === items.length - 1 || reordering}
        >
          <ChevronDown className="w-4 h-4" />
        </IconButton>
        <IconButton label={`Rename ${cat.name}`} tone="primary" onClick={() => openEdit(cat)}>
          <Pencil className="w-4 h-4" />
        </IconButton>
        <IconButton label={`Delete ${cat.name}`} tone="danger" onClick={() => handleDelete(cat)}>
          <Trash2 className="w-4 h-4" />
        </IconButton>
      </div>
    );
  }

  const dirty = showForm && formName.trim() !== originalName.trim();
  const moveCount = moveTarget ? ingredientCounts[moveTarget.slug] ?? 0 : 0;

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

      {/* Mobile: card list */}
      <ul className="md:hidden space-y-2">
        {items.map((cat, index) => (
          <li key={cat.id} className="bg-white rounded-xl border p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{cat.name}</p>
              <p className="text-xs text-gray-500">
                {plural(ingredientCounts[cat.slug] ?? 0, "ingredient")}
              </p>
            </div>
            {renderActions(cat, index)}
          </li>
        ))}
        {items.length === 0 && (
          <li className="bg-white rounded-xl border p-6 text-center text-sm text-gray-500">
            No categories yet.
          </li>
        )}
      </ul>

      {/* Desktop: table */}
      <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-gray-600 font-medium">Name</th>
              <th className="px-4 py-3 text-left text-gray-600 font-medium">Slug</th>
              <th className="px-4 py-3 text-right text-gray-600 font-medium">Ingredients</th>
              <th className="px-4 py-3 text-right text-gray-600 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((cat, index) => (
              <tr key={cat.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{cat.name}</td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">{cat.slug}</td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {ingredientCounts[cat.slug] ?? 0}
                </td>
                <td className="px-4 py-3">{renderActions(cat, index)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / rename */}
      <Modal
        open={showForm}
        onClose={closeForm}
        dirty={dirty}
        title={editCategory ? "Rename category" : "Add category"}
        size="sm"
        initialFocusRef={nameInputRef}
        footer={
          <>
            <button
              type="button"
              onClick={closeForm}
              className="flex-1 py-2 px-4 border text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="category-form"
              disabled={saving || !formName.trim()}
              className="flex-1 py-2 px-4 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
            >
              {saving ? "Saving..." : editCategory ? "Rename" : "Add"}
            </button>
          </>
        }
      >
        <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 p-2 rounded">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="category-name" className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              id="category-name"
              ref={nameInputRef}
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Spices"
              className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              required
            />
            {editCategory ? (
              <p className="mt-1 text-xs text-gray-500">
                The slug stays <span className="font-mono">{editCategory.slug}</span>, so
                existing ingredients keep working.
              </p>
            ) : formName.trim() ? (
              <p className="mt-1 text-xs text-gray-400">Slug: {slugify(formName)}</p>
            ) : null}
          </div>
        </form>
      </Modal>

      {/* Delete a category that still has ingredients: move them first */}
      <Modal
        open={moveTarget !== null}
        onClose={() => setMoveTarget(null)}
        closeOnBackdrop={!moving}
        title={moveTarget ? `Delete "${moveTarget.name}"` : ""}
        description={`${plural(moveCount, "ingredient")} still use this category. Move them to another category, then the category is deleted.`}
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setMoveTarget(null)}
              disabled={moving}
              className="flex-1 py-2 px-4 border text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleMoveAndDelete}
              disabled={moving || !moveToSlug || otherCategories.length === 0}
              className="flex-1 py-2 px-4 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm"
            >
              {moving ? "Moving..." : "Move and delete"}
            </button>
          </>
        }
      >
        {otherCategories.length === 0 ? (
          <p className="text-sm text-gray-600">
            There is no other category to move these ingredients to. Add another category first.
          </p>
        ) : (
          <div className="space-y-2">
            <label htmlFor="move-to-category" className="block text-sm font-medium text-gray-700">
              Move {moveCount === 1 ? "it" : `${moveCount} ingredients`} to
            </label>
            <select
              id="move-to-category"
              value={moveToSlug}
              onChange={(e) => setMoveToSlug(e.target.value)}
              disabled={moving}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              {otherCategories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {moveError && (
          <p role="alert" className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded">
            {moveError}
          </p>
        )}
      </Modal>
    </div>
  );
}
