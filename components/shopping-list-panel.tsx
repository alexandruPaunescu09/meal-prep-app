"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, Printer, RotateCcw } from "lucide-react";
import {
  generateShoppingList,
  shoppingListToText,
} from "@/lib/calculations/shopping-list";
import type { MealPlanEntry, Recipe, RecipeIngredient, Ingredient } from "@/lib/supabase/types";
import { useShoppingChecks } from "@/lib/hooks/use-shopping-checks";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { copyText, escapeHtml, printHtml } from "@/lib/browser";
import { formatWeekRange } from "@/lib/format";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

const BTN =
  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors";

/**
 * Shopping list with "have it" check-offs (persisted per week), Copy, Print,
 * Hide checked and Clear checks. Shared by the plan grid and the weekly modal.
 */
export default function ShoppingListPanel({
  entries,
  weekStart,
  categoryLabels,
  plansLabel,
  loading = false,
  emptyMessage = "No entries yet.",
}: {
  entries: FullEntry[];
  weekStart: string;
  categoryLabels: Record<string, string>;
  /** Comma-separated plan/client names shown in the printout. */
  plansLabel: string;
  loading?: boolean;
  emptyMessage?: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const {
    checkedItems,
    toggle: toggleItem,
    clearAll: clearAllChecks,
  } = useShoppingChecks(weekStart || null);
  const [copied, setCopied] = useState(false);
  const [hideChecked, setHideChecked] = useState(false);

  const { groups, totalCost } = useMemo(
    () => generateShoppingList(entries, categoryLabels),
    [entries, categoryLabels]
  );

  const toBuyGroups = useMemo(
    () =>
      groups
        .map((g) => {
          const items = g.items.filter((i) => !checkedItems.has(i.ingredientId));
          return {
            ...g,
            items,
            subtotal: items.reduce((sum, i) => sum + i.estimatedCost, 0),
          };
        })
        .filter((g) => g.items.length > 0),
    [groups, checkedItems]
  );
  const toBuyCost = toBuyGroups.reduce((s, g) => s + g.subtotal, 0);
  const visibleGroups = hideChecked ? toBuyGroups : groups;
  const checkedCount = checkedItems.size;

  async function handleCopy() {
    const ok = await copyText(shoppingListToText(toBuyGroups, toBuyCost));
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(
        "Could not copy to the clipboard (browser blocked it). Use Print instead."
      );
    }
  }

  function handlePrint() {
    const rows = toBuyGroups
      .map(
        (g) =>
          `<h2>${escapeHtml(g.label)}</h2><table>${g.items
            .map(
              (i) =>
                `<tr><td class="box">&#9744;</td><td>${escapeHtml(i.name)}</td><td class="r">${
                  i.totalQuantity % 1 === 0
                    ? i.totalQuantity
                    : i.totalQuantity.toFixed(1)
                }${escapeHtml(i.unit)}</td><td class="r">${i.estimatedCost.toFixed(2)} lei</td></tr>`
            )
            .join("")}</table>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Shopping list</title><style>
      body{font-family:system-ui,sans-serif;color:#111;margin:24px}
      h1{font-size:18px;margin:0 0 4px} p{margin:0 0 12px;font-size:12px;color:#555}
      h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#555;margin:16px 0 4px}
      table{width:100%;border-collapse:collapse;font-size:13px} td{padding:4px 6px;border-bottom:1px solid #ddd}
      .box{width:20px;font-size:16px} .r{text-align:right;white-space:nowrap}
    </style></head><body><h1>Shopping list · ${escapeHtml(formatWeekRange(weekStart))}</h1>
    <p>${escapeHtml(plansLabel)} · estimated ${toBuyCost.toFixed(2)} lei</p>
    ${rows || "<p>Nothing left to buy.</p>"}</body></html>`;
    if (!printHtml(html)) toast.error("Could not open the print view.");
  }

  async function handleClearChecks() {
    const ok = await confirm({
      title: "Clear all checks?",
      message: `Unmark ${checkedCount} item${checkedCount !== 1 ? "s" : ""} for ${formatWeekRange(weekStart)}. This is shared across all plans that week.`,
      confirmLabel: "Clear checks",
      tone: "danger",
    });
    if (!ok) return;
    clearAllChecks();
  }

  return (
    <div>
      <p className="text-xs text-gray-500 bg-gray-50 border rounded-lg px-3 py-2 mb-3">
        Tick <strong>Have it</strong> for items already in stock. They are left
        out of Copy, Print and the &ldquo;still to buy&rdquo; total, and the
        ticks are shared by every plan in this week.
      </p>
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button type="button" onClick={handleCopy} className={BTN}>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            {copied ? "Copied!" : "Copy"}
          </button>
          <button type="button" onClick={handlePrint} className={BTN}>
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
          <button
            type="button"
            onClick={() => setHideChecked((v) => !v)}
            aria-pressed={hideChecked}
            className={BTN}
          >
            {hideChecked ? (
              <Eye className="w-3.5 h-3.5" />
            ) : (
              <EyeOff className="w-3.5 h-3.5" />
            )}
            {hideChecked ? "Show checked" : "Hide checked"}
          </button>
          {checkedCount > 0 && (
            <button
              type="button"
              onClick={handleClearChecks}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear checks
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">{emptyMessage}</p>
      ) : visibleGroups.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          Everything is checked. Nothing left to buy.
        </p>
      ) : (
        <div className="space-y-5">
          {visibleGroups.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const checked = checkedItems.has(item.ingredientId);
                  return (
                    <label
                      key={item.ingredientId}
                      className={`flex items-center gap-2 py-2 px-3 bg-gray-50 rounded-lg cursor-pointer ${checked ? "opacity-50" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(item.ingredientId)}
                        aria-label={`Have it: ${item.name}`}
                        className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                      />
                      <span
                        className={`text-sm font-medium text-gray-900 flex-1 ${checked ? "line-through" : ""}`}
                      >
                        {item.name}
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          {checked ? "Have it" : ""}
                        </span>
                      </span>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-600">
                          {item.totalQuantity % 1 === 0
                            ? item.totalQuantity
                            : item.totalQuantity.toFixed(1)}
                          {item.unit}
                        </span>
                        <span className="text-emerald-700 font-medium w-20 text-right">
                          {item.estimatedCost.toFixed(2)} lei
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 text-right mt-1">
                Subtotal: {group.subtotal.toFixed(2)} lei
              </p>
            </div>
          ))}
        </div>
      )}

      {!loading && groups.length > 0 && (
        <div className="sticky bottom-0 bg-white border-t mt-4 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">
              {checkedCount > 0 ? "Still to buy" : "Total Estimated Cost"}
            </span>
            <span className="text-lg font-bold text-emerald-700">
              {toBuyCost.toFixed(2)} lei
            </span>
          </div>
          {checkedCount > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Full list {totalCost.toFixed(2)} lei · {checkedCount} item
              {checkedCount !== 1 ? "s" : ""} marked &ldquo;Have it&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
