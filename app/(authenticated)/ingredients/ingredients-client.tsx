"use client";

import { useState, Fragment, useMemo, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Ingredient, Category } from "@/lib/supabase/types";
import IngredientForm from "@/components/ingredient-form";
import { invalidateIngredients } from "@/lib/actions/revalidate";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Settings,
  ReceiptText,
  ScanBarcode,
  Search,
  Users,
  ArrowUpDown,
  X,
} from "lucide-react";
import Link from "next/link";
import { IconButton } from "@/components/ui/icon-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { formatLei, formatPricePerUnit, humanizeSlug } from "@/lib/format";

type SortKey = "name" | "ppu" | "calories";
type QuickFilter = "all" | "noprice" | "nonutrition";

export interface IngredientsInitialView {
  q: string;
  cat: string;
  quick: string;
  sort: string;
  dir: "asc" | "desc";
  openNew: boolean;
  openScan: boolean;
  editId: string | null;
}

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  ppu: "Price per unit",
  calories: "Calories",
};

function hasNoPrice(i: Ingredient) {
  return !(i.package_price > 0) || !(i.price_per_unit > 0);
}

function hasNoNutrition(i: Ingredient) {
  return i.calories === null && i.protein === null && i.carbs === null && i.fat === null;
}

export default function IngredientsClient({
  ingredients,
  categories,
  initial,
}: {
  ingredients: Ingredient[];
  categories: Category[];
  initial: IngredientsInitialView;
}) {
  const router = useRouter();
  const supabase = createClient();
  const confirm = useConfirm();
  const toast = useToast();

  const [filter, setFilter] = useState<string>(initial.cat);
  const [search, setSearch] = useState(initial.q);
  const [quick, setQuick] = useState<QuickFilter>(
    initial.quick === "noprice" || initial.quick === "nonutrition" ? initial.quick : "all"
  );
  const [sortKey, setSortKey] = useState<SortKey>(
    initial.sort === "ppu" || initial.sort === "calories" ? initial.sort : "name"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initial.dir);

  const initialEdit = initial.editId
    ? ingredients.find((i) => i.id === initial.editId)
    : undefined;
  const [showForm, setShowForm] = useState(
    initial.openNew || initial.openScan || !!initialEdit
  );
  const [editIngredient, setEditIngredient] = useState<Ingredient | undefined>(initialEdit);
  const [startScanner, setStartScanner] = useState(initial.openScan && !initialEdit);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeCategories = useMemo(() => {
    const usedSlugs = new Set(ingredients.map((i) => i.category));
    return categories.filter((c) => usedSlugs.has(c.slug));
  }, [ingredients, categories]);

  const categoryLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.slug] = c.name;
    return map;
  }, [categories]);

  // If the selected category no longer has ingredients, fall back to "all".
  const effectiveFilter =
    filter === "all" || activeCategories.some((c) => c.slug === filter) ? filter : "all";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = ingredients.filter((i) => {
      if (effectiveFilter !== "all" && i.category !== effectiveFilter) return false;
      if (quick === "noprice" && !hasNoPrice(i)) return false;
      if (quick === "nonutrition" && !hasNoNutrition(i)) return false;
      if (q) {
        const hay = `${i.name} ${i.brand ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      if (sortKey === "name") return dir * a.name.localeCompare(b.name, "ro");
      const av = sortKey === "ppu" ? a.price_per_unit : a.calories;
      const bv = sortKey === "ppu" ? b.price_per_unit : b.calories;
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // nulls last regardless of direction
      if (bv === null) return -1;
      return dir * (av - bv);
    });
    return list;
  }, [ingredients, effectiveFilter, quick, search, sortKey, sortDir]);

  const noPriceCount = useMemo(() => ingredients.filter(hasNoPrice).length, [ingredients]);
  const noNutritionCount = useMemo(
    () => ingredients.filter(hasNoNutrition).length,
    [ingredients]
  );

  const isFiltered = effectiveFilter !== "all" || quick !== "all" || search.trim() !== "";

  // Keep filters/sort in the URL (and drop one-shot params like ?new=1).
  const firstSync = useRef(true);
  const syncedSearch = useRef(search);
  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (effectiveFilter !== "all") params.set("cat", effectiveFilter);
    if (quick !== "all") params.set("f", quick);
    if (sortKey !== "name" || sortDir !== "asc") {
      params.set("sort", sortKey);
      params.set("dir", sortDir);
    }
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (firstSync.current) {
      firstSync.current = false;
      if (
        !initial.openNew &&
        !initial.openScan &&
        !initial.editId &&
        url === `${window.location.pathname}${window.location.search}`
      ) {
        return;
      }
    }
    // Debounce when only the search text changed; other changes write immediately.
    const searchOnly = search !== syncedSearch.current;
    syncedSearch.current = search;
    if (!searchOnly) {
      router.replace(url, { scroll: false });
      return;
    }
    const timer = setTimeout(() => router.replace(url, { scroll: false }), 300);
    return () => clearTimeout(timer);
  }, [router, search, effectiveFilter, quick, sortKey, sortDir, initial.openNew, initial.openScan, initial.editId]);

  function clearFilters() {
    setSearch("");
    setFilter("all");
    setQuick("all");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title: `Delete "${name}"?`,
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(id);
    const { error } = await supabase.from("ingredients").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      if (error.code === "23503") {
        await reportInUse(id, name);
      } else {
        toast.error(`Could not delete "${name}": ${error.message}`);
      }
      return;
    }
    await invalidateIngredients();
    router.refresh();
    toast.success(`Deleted "${name}"`);
  }

  async function reportInUse(id: string, name: string) {
    const [recipesRes, entriesRes] = await Promise.all([
      supabase.from("recipe_ingredients").select("recipes(name)").eq("ingredient_id", id),
      supabase
        .from("meal_plan_entries")
        .select("id", { count: "exact", head: true })
        .eq("ingredient_id", id),
    ]);
    const names = Array.from(
      new Set(
        ((recipesRes.data ?? []) as unknown as {
          recipes: { name: string } | { name: string }[] | null;
        }[])
          .flatMap((r) => (Array.isArray(r.recipes) ? r.recipes : r.recipes ? [r.recipes] : []))
          .map((r) => r.name)
      )
    );
    const parts: string[] = [];
    if (names.length > 0) {
      const shown = names.slice(0, 5).join(", ");
      parts.push(
        `${names.length === 1 ? "recipe" : "recipes"} ${shown}${names.length > 5 ? ` and ${names.length - 5} more` : ""}`
      );
    }
    const entryCount = entriesRes.count ?? 0;
    if (entryCount > 0) {
      parts.push(`${entryCount} meal plan ${entryCount === 1 ? "entry" : "entries"}`);
    }
    toast.error(
      parts.length > 0
        ? `Cannot delete "${name}": it is used in ${parts.join(" and ")}. Remove it there first.`
        : `Cannot delete "${name}": it is still used elsewhere.`,
      { duration: 8000 }
    );
  }

  function openAdd(scan: boolean) {
    setEditIngredient(undefined);
    setStartScanner(scan);
    setShowForm(true);
  }

  function openEdit(ingredient: Ingredient) {
    setEditIngredient(ingredient);
    setStartScanner(false);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setStartScanner(false);
    setEditIngredient(undefined);
  }

  function toggleExpanded(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  function renderSortHeader(sortId: SortKey, label: string, align: "left" | "right" = "right") {
    const active = sortKey === sortId;
    return (
      <th
        key={sortId}
        scope="col"
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        className={`px-4 py-3 font-medium text-gray-600 ${align === "right" ? "text-right" : "text-left"}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(sortId)}
          className={`inline-flex items-center gap-1 hover:text-gray-900 ${active ? "text-gray-900" : ""}`}
        >
          {label}
          {active ? (
            sortDir === "asc" ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-300" />
          )}
        </button>
      </th>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ingredients</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isFiltered
              ? `${filtered.length} of ${ingredients.length} ingredients`
              : `${ingredients.length} ${ingredients.length === 1 ? "ingredient" : "ingredients"} in database`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/ingredients/import"
            aria-label="Import receipt"
            title="Import receipt"
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            <ReceiptText className="w-4 h-4" />
            <span className="hidden sm:inline">Import receipt</span>
          </Link>
          <Link
            href="/ingredients/foods"
            aria-label="Customer foods"
            title="Customer foods"
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Customer foods</span>
          </Link>
          <Link
            href="/ingredients/categories"
            aria-label="Categories"
            title="Categories"
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Categories</span>
          </Link>
          <button
            type="button"
            onClick={() => openAdd(true)}
            aria-label="Scan barcode"
            className="flex items-center gap-2 px-3 py-2 border border-emerald-600 text-emerald-700 font-medium rounded-lg hover:bg-emerald-50 text-sm"
          >
            <ScanBarcode className="w-4 h-4" />
            <span className="hidden sm:inline">Scan</span>
          </button>
          <button
            type="button"
            onClick={() => openAdd(false)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>
              Add<span className="hidden sm:inline"> ingredient</span>
            </span>
          </button>
        </div>
      </div>

      {/* Search + sort + quick filters */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or brand..."
              aria-label="Search ingredients"
              className="w-full pl-10 pr-3 py-2 border rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <div className="md:hidden flex items-center gap-1">
            <select
              value={sortKey}
              onChange={(e) => {
                setSortKey(e.target.value as SortKey);
                setSortDir("asc");
              }}
              aria-label="Sort by"
              className="px-2 py-2 border rounded-lg bg-white text-sm text-gray-700"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
            <IconButton
              label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            >
              {sortDir === "asc" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </IconButton>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1 items-center">
          <button
            type="button"
            onClick={() => setFilter("all")}
            aria-pressed={effectiveFilter === "all"}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              effectiveFilter === "all"
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {activeCategories.map((cat) => (
            <button
              type="button"
              key={cat.slug}
              onClick={() => setFilter(cat.slug)}
              aria-pressed={effectiveFilter === cat.slug}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                effectiveFilter === cat.slug
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-gray-200 shrink-0" aria-hidden="true" />
          {(
            [
              { id: "noprice", label: "No price", count: noPriceCount },
              { id: "nonutrition", label: "No nutrition", count: noNutritionCount },
            ] as const
          ).map((f) => (
            <button
              type="button"
              key={f.id}
              onClick={() => setQuick(quick === f.id ? "all" : f.id)}
              aria-pressed={quick === f.id}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border ${
                quick === f.id
                  ? "bg-amber-500 border-amber-500 text-white"
                  : "bg-white border-amber-300 text-amber-700 hover:bg-amber-50"
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
          {isFiltered && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          {ingredients.length === 0 ? (
            <>
              <p className="text-gray-500">No ingredients yet.</p>
              <button
                type="button"
                onClick={() => openAdd(false)}
                className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Add your first ingredient
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-500">No ingredients match your filters.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Clear filters
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((ing) => (
              <div key={ing.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(ing.id)}
                    aria-expanded={expandedId === ing.id}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-medium text-gray-900">
                      {ing.name}
                      {ing.brand && (
                        <span className="ml-1.5 text-xs font-normal text-gray-400">{ing.brand}</span>
                      )}
                    </p>
                    <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                      {categoryLabels[ing.category] ?? ing.category}
                    </span>
                  </button>
                  <div className="flex items-center ml-2">
                    <IconButton label={`Edit ${ing.name}`} onClick={() => openEdit(ing)}>
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton
                      label={`Delete ${ing.name}`}
                      tone="danger"
                      disabled={deletingId === ing.id}
                      onClick={() => handleDelete(ing.id, ing.name)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Price/unit</span>
                    <p className="font-medium text-emerald-700">
                      {hasNoPrice(ing) ? "—" : formatPricePerUnit(ing.price_per_unit, ing.unit)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Cal</span>
                    <p className="font-medium text-gray-900">{ing.calories ?? "—"}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">P / C / F</span>
                    <p className="font-medium text-gray-900">
                      {ing.protein ?? "—"} / {ing.carbs ?? "—"} / {ing.fat ?? "—"}
                    </p>
                  </div>
                </div>
                {expandedId === ing.id && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Qty</span>
                        <p className="font-medium text-gray-900">
                          {ing.quantity_purchased} {ing.unit}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Package</span>
                        <p className="font-medium text-gray-900">{formatLei(ing.package_price)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Fiber</span>
                        <p className="font-medium text-gray-900">
                          {ing.fiber !== null ? `${ing.fiber}g` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Sugar</span>
                        <p className="font-medium text-gray-900">
                          {ing.sugar !== null ? `${ing.sugar}g` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Sat Fat</span>
                        <p className="font-medium text-gray-900">
                          {ing.sat_fat !== null ? `${ing.sat_fat}g` : "—"}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Salt</span>
                        <p className="font-medium text-gray-900">
                          {ing.salt !== null ? `${ing.salt}g` : "—"}
                        </p>
                      </div>
                      {Object.entries(ing.micronutrients || {}).map(([key, val]) => (
                        <div key={key}>
                          <span className="text-gray-500">{humanizeSlug(key)}</span>
                          <p className="font-medium text-gray-900">
                            {typeof val === "number" ? val.toFixed(1) : val}
                          </p>
                        </div>
                      ))}
                    </div>
                    {ing.api_source && (
                      <p className="mt-2 text-xs text-gray-400">
                        Source: {ing.api_source}
                        {ing.barcode && ` • Barcode: ${ing.barcode}`}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    {renderSortHeader("name", "Name", "left")}
                    <th scope="col" className="text-left px-4 py-3 font-medium text-gray-600">
                      Category
                    </th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-gray-600">
                      Qty
                    </th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-gray-600">
                      Price
                    </th>
                    {renderSortHeader("ppu", "Price/unit")}
                    {renderSortHeader("calories", "Cal")}
                    <th scope="col" className="text-right px-4 py-3 font-medium text-gray-600">
                      P
                    </th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-gray-600">
                      C
                    </th>
                    <th scope="col" className="text-right px-4 py-3 font-medium text-gray-600">
                      F
                    </th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ing) => (
                    <Fragment key={ing.id}>
                      <tr
                        className="border-b last:border-0 hover:bg-gray-50 cursor-pointer"
                        onClick={() => toggleExpanded(ing.id)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(ing.id);
                            }}
                            aria-expanded={expandedId === ing.id}
                            className="flex items-center gap-2 text-left"
                          >
                            {expandedId === ing.id ? (
                              <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            )}
                            {ing.name}
                            {ing.brand && (
                              <span className="text-xs font-normal text-gray-400">{ing.brand}</span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                            {categoryLabels[ing.category] ?? ing.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.quantity_purchased} {ing.unit}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {formatLei(ing.package_price)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700">
                          {hasNoPrice(ing) ? "—" : formatPricePerUnit(ing.price_per_unit, ing.unit)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.calories ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.protein !== null ? `${ing.protein}g` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.carbs !== null ? `${ing.carbs}g` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {ing.fat !== null ? `${ing.fat}g` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <IconButton label={`Edit ${ing.name}`} onClick={() => openEdit(ing)}>
                              <Pencil size={16} />
                            </IconButton>
                            <IconButton
                              label={`Delete ${ing.name}`}
                              tone="danger"
                              disabled={deletingId === ing.id}
                              onClick={() => handleDelete(ing.id, ing.name)}
                            >
                              <Trash2 size={16} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                      {expandedId === ing.id && (
                        <tr className="border-b">
                          <td colSpan={10} className="px-4 py-3 bg-gray-50">
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-3 text-xs">
                              <div>
                                <span className="text-gray-500">Fiber</span>
                                <p className="font-medium text-gray-900">
                                  {ing.fiber !== null ? `${ing.fiber}g` : "—"}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Sugar</span>
                                <p className="font-medium text-gray-900">
                                  {ing.sugar !== null ? `${ing.sugar}g` : "—"}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Sat Fat</span>
                                <p className="font-medium text-gray-900">
                                  {ing.sat_fat !== null ? `${ing.sat_fat}g` : "—"}
                                </p>
                              </div>
                              <div>
                                <span className="text-gray-500">Salt</span>
                                <p className="font-medium text-gray-900">
                                  {ing.salt !== null ? `${ing.salt}g` : "—"}
                                </p>
                              </div>
                              {Object.entries(ing.micronutrients || {}).map(([key, val]) => (
                                <div key={key}>
                                  <span className="text-gray-500">{humanizeSlug(key)}</span>
                                  <p className="font-medium text-gray-900">
                                    {typeof val === "number" ? val.toFixed(1) : val}
                                  </p>
                                </div>
                              ))}
                            </div>
                            {ing.api_source && (
                              <p className="mt-2 text-xs text-gray-400">
                                Source: {ing.api_source}
                                {ing.barcode && ` • Barcode: ${ing.barcode}`}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Form modal */}
      {showForm && (
        <IngredientForm
          key={editIngredient?.id ?? "new"}
          ingredient={editIngredient}
          categories={categories}
          onClose={closeForm}
          startWithScanner={startScanner}
          onOpenExisting={(id) => {
            const found = ingredients.find((i) => i.id === id);
            if (!found) return;
            setStartScanner(false);
            setEditIngredient(found);
          }}
        />
      )}
    </div>
  );
}
