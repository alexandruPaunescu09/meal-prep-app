"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { invalidateFoods } from "@/lib/actions/revalidate";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import IngredientForm from "@/components/ingredient-form";
import FoodEditModal from "@/components/admin/food-edit-modal";
import FoodMergeModal from "@/components/admin/food-merge-modal";
import { countByStatus, filterFoods, type FoodFilters } from "@/lib/admin/food-edit";
import { formatDate, formatNumber } from "@/lib/format";
import type { AdminFood } from "@/lib/data/foods";
import type { Category, FoodSource, FoodStatus } from "@/lib/supabase/types";

export interface FoodPhotos {
  label?: string;
  front?: string;
}

export interface FoodsInitialView {
  status: FoodStatus;
  source: FoodSource | "all";
  creator: string;
}

const STATUSES: { key: FoodStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "active", label: "Active" },
  { key: "hidden", label: "Hidden" },
];

const SOURCE_LABEL: Record<FoodSource, string> = {
  off: "Open Food Facts",
  label_photo: "Label photo",
  admin: "Admin",
};

const STATUS_STYLE: Record<FoodStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-emerald-100 text-emerald-800",
  hidden: "bg-gray-200 text-gray-700",
};

const BTN =
  "px-2.5 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50";

const n1 = (v: number | null) => (v == null ? "—" : formatNumber(v, 1));

export default function FoodsClient({
  foods,
  clients,
  categories,
  photos,
  initial,
}: {
  foods: AdminFood[];
  clients: { id: string; name: string }[];
  categories: Category[];
  photos: Record<string, FoodPhotos>;
  initial: FoodsInitialView;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useState<FoodFilters>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminFood | null>(null);
  const [merging, setMerging] = useState<AdminFood | null>(null);
  const [promoting, setPromoting] = useState<AdminFood | null>(null);
  const [viewing, setViewing] = useState<AdminFood | null>(null);

  const counts = useMemo(() => countByStatus(foods), [foods]);
  const visible = useMemo(() => filterFoods(foods, filters), [foods, filters]);
  const creators = useMemo(() => {
    const ids = new Set(foods.map((f) => f.created_by_client_id).filter((x): x is string => !!x));
    return clients.filter((c) => ids.has(c.id));
  }, [foods, clients]);

  function updateFilters(next: FoodFilters) {
    setFilters(next);
    const p = new URLSearchParams();
    if (next.status !== "pending") p.set("status", next.status);
    if (next.source !== "all") p.set("source", next.source);
    if (next.creator !== "all") p.set("creator", next.creator);
    const qs = p.toString();
    router.replace(qs ? `/ingredients/foods?${qs}` : "/ingredients/foods", { scroll: false });
  }

  async function refresh() {
    await invalidateFoods();
    router.refresh();
  }

  async function setStatus(food: AdminFood, status: FoodStatus, success: string) {
    setBusyId(food.id);
    const supabase = createClient();
    const patch: { status: FoodStatus; verified_at?: string } = { status };
    if (status === "active" && food.status === "pending") patch.verified_at = new Date().toISOString();
    const { error } = await supabase.from("foods").update(patch).eq("id", food.id);
    setBusyId(null);
    if (error) {
      toast.error(`Could not update "${food.name}": ${error.message}`, {
        action: { label: "Retry", onClick: () => void setStatus(food, status, success) },
      });
      return;
    }
    toast.success(success);
    await refresh();
  }

  async function hide(food: AdminFood) {
    const ok = await confirm({
      title: `Hide "${food.name}"?`,
      message: "Customers will no longer find it in search. Past diary entries keep their values.",
      confirmLabel: "Hide",
    });
    if (ok) await setStatus(food, "hidden", "Food hidden");
  }

  /** A never-verified label-photo food goes back to the review queue instead of straight to active. */
  async function unhide(food: AdminFood) {
    const backToQueue = food.source === "label_photo" && !food.verified_at;
    await setStatus(
      food,
      backToQueue ? "pending" : "active",
      backToQueue ? "Food is back in the review queue" : "Food is visible again"
    );
  }

  async function onPromoted(food: AdminFood, ingredientId: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("foods")
      .update({ promoted_ingredient_id: ingredientId })
      .eq("id", food.id);
    if (error) {
      toast.error(`Ingredient saved, but the food could not be linked to it: ${error.message}`);
      return;
    }
    toast.success("Promoted: customers now see the ingredient instead of this food");
    await refresh();
  }

  function Actions({ food }: { food: AdminFood }) {
    const busy = busyId === food.id;
    return (
      <div className="flex flex-wrap gap-1.5">
        {food.status === "pending" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void setStatus(food, "active", "Food verified")}
            className="px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            Verify
          </button>
        )}
        <button type="button" className={BTN} onClick={() => setEditing(food)}>
          Edit
        </button>
        {food.status === "hidden" ? (
          <button
            type="button"
            className={BTN}
            disabled={busy}
            onClick={() => void unhide(food)}
          >
            Unhide
          </button>
        ) : (
          <button type="button" className={BTN} disabled={busy} onClick={() => void hide(food)}>
            Hide
          </button>
        )}
        <button type="button" className={BTN} onClick={() => setMerging(food)}>
          Merge…
        </button>
        {food.promoted_ingredient_id ? (
          <span className="px-2 py-1.5 text-xs text-emerald-700">Promoted</span>
        ) : (
          <button type="button" className={BTN} onClick={() => setPromoting(food)}>
            Promote…
          </button>
        )}
        {photos[food.id] && (
          <button type="button" className={`${BTN} inline-flex items-center gap-1`} onClick={() => setViewing(food)}>
            <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
            Photos
          </button>
        )}
      </div>
    );
  }

  function Creator({ food }: { food: AdminFood }) {
    if (!food.created_by_client_id) return <span className="text-gray-400">—</span>;
    return (
      <Link href={`/clients#client-${food.created_by_client_id}`} className="text-emerald-700 hover:underline">
        {food.creator_name ?? "Client"}
      </Link>
    );
  }

  const nutrition = (f: AdminFood) =>
    `${f.calories == null ? "—" : Math.round(f.calories)} kcal · P ${n1(f.protein)} · C ${n1(f.carbs)} · F ${n1(f.fat)}`;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Customer foods</h1>
        <p className="text-sm text-gray-500 mt-1">
          Products customers added by scanning a barcode or photographing a label. Values are per 100 g / ml.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={filters.status === s.key}
              onClick={() => updateFilters({ ...filters, status: s.key })}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                filters.status === s.key
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {s.label} ({counts[s.key]})
            </button>
          ))}
        </div>
        <select
          aria-label="Source"
          value={filters.source}
          onChange={(e) => updateFilters({ ...filters, source: e.target.value as FoodFilters["source"] })}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-700"
        >
          <option value="all">All sources</option>
          <option value="off">Open Food Facts</option>
          <option value="label_photo">Label photo</option>
          <option value="admin">Admin</option>
        </select>
        <select
          aria-label="Creator"
          value={filters.creator}
          onChange={(e) => updateFilters({ ...filters, creator: e.target.value })}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-700"
        >
          <option value="all">All creators</option>
          <option value="none">No creator</option>
          {creators.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-500">
          No {filters.status} foods match these filters.
        </div>
      ) : (
        <>
          {/* Cards below xl (the 10-column table needs the width; the sidebar already takes 16rem at lg) */}
          <ul className="xl:hidden space-y-3">
            {visible.map((f) => (
              <li key={f.id} className="bg-white rounded-xl border p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{f.name}</p>
                    {f.brand && <p className="text-sm text-gray-500">{f.brand}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[f.status]}`}>
                    {f.status}
                  </span>
                </div>
                <p className="text-sm text-gray-700">
                  {nutrition(f)} <span className="text-gray-400">/ 100 {f.unit}</span>
                </p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500">
                  <dt>Barcode</dt>
                  <dd className="text-gray-800 break-all">{f.barcode ?? "—"}</dd>
                  <dt>Source</dt>
                  <dd className="text-gray-800">{SOURCE_LABEL[f.source]}</dd>
                  <dt>Added by</dt>
                  <dd className="text-gray-800">
                    <Creator food={f} />
                  </dd>
                  <dt>Created</dt>
                  <dd className="text-gray-800">{formatDate(f.created_at)}</dd>
                  <dt>Logged</dt>
                  <dd className="text-gray-800">{f.usage_count}×</dd>
                </dl>
                <Actions food={f} />
              </li>
            ))}
          </ul>

          {/* Desktop table */}
          <div className="hidden xl:block bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Food</th>
                  <th scope="col" className="px-3 py-3">Barcode</th>
                  <th scope="col" className="px-3 py-3">Unit</th>
                  <th scope="col" className="px-3 py-3">Per 100</th>
                  <th scope="col" className="px-3 py-3">Source</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Added by</th>
                  <th scope="col" className="px-3 py-3">Created</th>
                  <th scope="col" className="px-3 py-3 text-right">Logged</th>
                  <th scope="col" className="px-3 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visible.map((f) => (
                  <tr key={f.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{f.name}</p>
                      {f.brand && <p className="text-xs text-gray-500">{f.brand}</p>}
                    </td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{f.barcode ?? "—"}</td>
                    <td className="px-3 py-3 text-gray-600">{f.unit}</td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{nutrition(f)}</td>
                    <td className="px-3 py-3 text-gray-600">{SOURCE_LABEL[f.source]}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLE[f.status]}`}>
                        {f.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Creator food={f} />
                    </td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{formatDate(f.created_at)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{f.usage_count}</td>
                    <td className="px-3 py-3 max-w-[16rem]">
                      <Actions food={f} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {editing && (
        <FoodEditModal key={editing.id} food={editing} onClose={() => setEditing(null)} onSaved={() => router.refresh()} />
      )}

      {merging && (
        <FoodMergeModal
          key={merging.id}
          from={merging}
          candidates={foods}
          onClose={() => setMerging(null)}
          onMerged={() => router.refresh()}
        />
      )}

      {promoting && (
        <IngredientForm
          categories={categories}
          onClose={() => setPromoting(null)}
          onSaved={(ing) => void onPromoted(promoting, ing.id)}
          defaults={{
            name: promoting.name,
            brand: promoting.brand ?? "",
            barcode: promoting.barcode,
            unit: promoting.unit,
            quantity_purchased: promoting.package_size ?? undefined,
            calories: promoting.calories,
            protein: promoting.protein,
            carbs: promoting.carbs,
            fat: promoting.fat,
            fiber: promoting.fiber,
            sugar: promoting.sugar,
            sat_fat: promoting.sat_fat,
            salt: promoting.salt,
            micronutrients: promoting.micronutrients ?? {},
          }}
        />
      )}

      {viewing && (
        <Modal open onClose={() => setViewing(null)} title={`Photos: ${viewing.name}`} size="lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {photos[viewing.id]?.label && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={photos[viewing.id].label} alt="Nutrition label" className="w-full rounded-lg border" />
                <figcaption className="mt-1 text-xs text-gray-500">Nutrition label</figcaption>
              </figure>
            )}
            {photos[viewing.id]?.front && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                <img src={photos[viewing.id].front} alt="Product front" className="w-full rounded-lg border" />
                <figcaption className="mt-1 text-xs text-gray-500">Front of pack</figcaption>
              </figure>
            )}
          </div>
          <p className="mt-3 text-xs text-gray-500">Links expire after 10 minutes; reload the page for fresh ones.</p>
        </Modal>
      )}
    </div>
  );
}
