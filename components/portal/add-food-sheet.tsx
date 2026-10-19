"use client";

import { useState } from "react";
import type { CatalogItem, DiaryQuantityUnit, MealType } from "@/lib/supabase/types";
import type { DiaryEntryInput } from "@/lib/validations/schemas";
import { Modal } from "@/components/ui/modal";
import { MEAL_SECTION_LABEL } from "@/components/portal/diary-section";
import MealTypeChips from "@/components/portal/meal-type-chips";
import FoodSearch, { useOnline, type RowFavorite } from "@/components/portal/food-search";
import RecentList, { useRecents } from "@/components/portal/recent-list";
import FavoriteList from "@/components/portal/favorite-list";
import { useFavorites } from "@/components/portal/favorite-star";
import AmountPicker from "@/components/portal/amount-picker";
import BarcodeLookup from "@/components/portal/barcode-lookup";
import QuickAddForm from "@/components/portal/quick-add-form";
import {
  buildCatalogInput,
  buildQuickInput,
  newEntryId,
  quickSnapshot,
  type SnapshotLike,
} from "@/lib/portal/diary-draft";

/** Tabs of the add-food sheet, in display order (the grid sizes itself from this list). */
const TABS = [
  { id: "recent", label: "Recent" },
  { id: "favorites", label: "Favorites" },
  { id: "search", label: "Search" },
  { id: "scan", label: "Scan" },
  { id: "quick", label: "Quick add" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * Add-food sheet: search the catalog or scan a barcode (pick an amount), or quick add. Saving is optimistic:
 * `onSave` records the entry and the sheet closes straight away.
 */
export default function AddFoodSheet({
  initialMeal,
  logDate,
  onSave,
  onClose,
}: {
  initialMeal: MealType;
  logDate: string;
  onSave: (input: DiaryEntryInput, snapshot: SnapshotLike) => Promise<boolean>;
  onClose: () => void;
}) {
  const [mealType, setMealType] = useState<MealType>(initialMeal);
  // null = automatic: Recent when there are recents (or they are still loading), else Search.
  const [chosenTab, setChosenTab] = useState<TabId | null>(null);
  const [picked, setPicked] = useState<CatalogItem | null>(null);
  const [pickedAmount, setPickedAmount] = useState<{ quantity: number; unit: DiaryQuantityUnit } | undefined>();
  const online = useOnline();
  const recents = useRecents(online);
  const favorites = useFavorites(online);

  const tab: TabId =
    chosenTab ?? (recents.status === "loading" || recents.items.length > 0 ? "recent" : "search");

  // Star state for rows and the picker header; stars need a connection.
  const rowFavorite = (item: CatalogItem): RowFavorite => ({
    on: favorites.isFavorite(item),
    disabled: !online || favorites.status !== "ready",
    onToggle: favorites.toggle,
  });

  function pick(item: CatalogItem, amount?: { quantity: number; unit: DiaryQuantityUnit }) {
    setPickedAmount(amount);
    setPicked(item);
  }

  function commit(input: DiaryEntryInput, snapshot: SnapshotLike) {
    // Optimistic: the entry shows at once and the sheet closes; a failed save rolls back with a toast.
    void onSave(input, snapshot);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      variant="sheet"
      title={`Add to ${MEAL_SECTION_LABEL[mealType]}`}
      dirty={picked !== null}
    >
      <div className="space-y-4">
        <MealTypeChips value={mealType} onChange={setMealType} />

        {picked ? (
          <AmountPicker
            item={picked}
            onBack={() => {
              setPicked(null);
              setPickedAmount(undefined);
            }}
            initialAmount={pickedAmount}
            favorite={rowFavorite(picked)}
            onSubmit={(quantity, unit, snapshot) =>
              void commit(
                buildCatalogInput({
                  id: newEntryId(),
                  logDate,
                  mealType,
                  item: picked,
                  quantity,
                  unit,
                }),
                snapshot
              )
            }
          />
        ) : (
          <>
            <div
              role="tablist"
              aria-label="Add food"
              style={{ gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))` }}
              className="grid gap-1 p-1 bg-gray-100 rounded-lg"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`add-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`add-panel-${t.id}`}
                  onClick={() => setChosenTab(t.id)}
                  className={`min-h-[40px] rounded-md text-xs sm:text-sm font-medium px-0.5 ${
                    tab === t.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`add-panel-${tab}`} aria-labelledby={`add-tab-${tab}`}>
              {tab === "recent" && (
                <RecentList
                  recents={recents}
                  onPick={(r) => pick(r.item, { quantity: r.quantity, unit: r.unit })}
                  rowFavorite={rowFavorite}
                />
              )}
              {tab === "favorites" && (
                <FavoriteList favorites={favorites} onPick={(item) => pick(item)} rowFavorite={rowFavorite} />
              )}
              {tab === "search" && <FoodSearch onPick={(item) => pick(item)} favorite={rowFavorite} />}
              {tab === "scan" && <BarcodeLookup onPick={setPicked} />}
              {tab === "quick" && (
                <QuickAddForm
                  submitLabel="Add to diary"
                  onSubmit={(v) => {
                    const input = buildQuickInput({
                      id: newEntryId(),
                      logDate,
                      mealType,
                      ...v,
                    });
                    void commit(input, quickSnapshot(input));
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
