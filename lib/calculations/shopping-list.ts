import { formatCost, humanizeSlug } from "@/lib/format";
import {
  Ingredient,
  Recipe,
  RecipeIngredient,
  MealPlanEntry,
} from "@/lib/supabase/types";

export interface ShoppingItem {
  ingredientId: string;
  name: string;
  category: string;
  totalQuantity: number;
  unit: string;
  /** Known cost; 0 when the ingredient has no price (see `unpriced`). */
  estimatedCost: number;
  /** True when the quantity is > 0 and the ingredient is price pending: estimatedCost is not a real figure. */
  unpriced: boolean;
  /** True when every use this week is a "to taste" seasoning line (total quantity 0). */
  toTasteOnly: boolean;
}

export interface ShoppingListGroup {
  category: string;
  label: string;
  items: ShoppingItem[];
  subtotal: number;
  unpricedCount: number;
}

/** Label of the Pantry check group. */
export const PANTRY_LABEL = "Pantry check";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

interface Accumulator {
  item: ShoppingItem;
  hasPrice: boolean;
  /** Used as a main line (or direct entry) at least once. */
  usedAsMain: boolean;
  /** Used with a real quantity (not "to taste") at least once. */
  usedWithQuantity: boolean;
}

/**
 * Builds the week's shopping list. Ingredients whose every use is a seasoning
 * line go to a separate `pantry` group (checked against the cupboard, left out
 * of `totalCost`); one used as a main line anywhere (a direct-ingredient entry
 * counts as main) stays in its category with the full total.
 */
export function generateShoppingList(
  entries: FullEntry[],
  categoryLabels?: Record<string, string>
): {
  groups: ShoppingListGroup[];
  pantry: ShoppingListGroup | null;
  totalCost: number;
  unpricedCount: number;
} {
  const itemMap = new Map<string, Accumulator>();

  for (const entry of entries) {
    if (entry.recipe) {
      const recipe = entry.recipe;
      const portionMultiplier = entry.portions / recipe.portions;

      for (const ri of recipe.recipe_ingredients) {
        if (!ri.ingredient) continue;

        const ing = ri.ingredient;
        const seasoning = ri.role === "seasoning";
        const toTaste = seasoning && ri.to_taste === true;
        const quantity = toTaste ? 0 : ri.quantity * portionMultiplier;
        accumulateItem(itemMap, ing, quantity, !seasoning, !toTaste);
      }
    } else if (entry.ingredient && entry.quantity) {
      const quantity = entry.quantity * entry.portions;
      accumulateItem(itemMap, entry.ingredient, quantity, true, true);
    }
  }

  const buyItemsByCategory = new Map<string, ShoppingItem[]>();
  const pantryItems: ShoppingItem[] = [];

  for (const acc of itemMap.values()) {
    const item = acc.item;
    item.unpriced = !acc.hasPrice && item.totalQuantity > 0;
    item.toTasteOnly = !acc.usedWithQuantity;
    if (!acc.usedAsMain) {
      pantryItems.push(item);
      continue;
    }
    const group = buyItemsByCategory.get(item.category) ?? [];
    group.push(item);
    buyItemsByCategory.set(item.category, group);
  }

  const groups: ShoppingListGroup[] = Array.from(buyItemsByCategory.entries())
    .map(([category, categoryItems]) => ({
      category,
      label: categoryLabels?.[category] ?? humanizeSlug(category),
      items: categoryItems.sort((a, b) => a.name.localeCompare(b.name)),
      subtotal: categoryItems.reduce((sum, i) => sum + i.estimatedCost, 0),
      unpricedCount: categoryItems.filter((i) => i.unpriced).length,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const pantry: ShoppingListGroup | null =
    pantryItems.length === 0
      ? null
      : {
          category: "pantry",
          label: PANTRY_LABEL,
          items: pantryItems.sort((a, b) => a.name.localeCompare(b.name)),
          subtotal: pantryItems.reduce((sum, i) => sum + i.estimatedCost, 0),
          unpricedCount: pantryItems.filter((i) => i.unpriced).length,
        };

  const buyItems = groups.flatMap((g) => g.items);
  return {
    groups,
    pantry,
    totalCost: buyItems.reduce((sum, i) => sum + i.estimatedCost, 0),
    unpricedCount: buyItems.filter((i) => i.unpriced).length,
  };
}

function accumulateItem(
  itemMap: Map<string, Accumulator>,
  ing: Ingredient,
  quantity: number,
  asMain: boolean,
  withQuantity: boolean
) {
  const price = ing.price_per_unit;
  const existing = itemMap.get(ing.id);
  if (existing) {
    existing.item.totalQuantity += quantity;
    if (price != null) existing.item.estimatedCost += quantity * price;
    existing.usedAsMain ||= asMain;
    existing.usedWithQuantity ||= withQuantity;
  } else {
    itemMap.set(ing.id, {
      item: {
        ingredientId: ing.id,
        name: ing.name,
        category: ing.category,
        totalQuantity: quantity,
        unit: ing.unit,
        estimatedCost: price == null ? 0 : quantity * price,
        unpriced: false,
        toTasteOnly: false,
      },
      hasPrice: price != null,
      usedAsMain: asMain,
      usedWithQuantity: withQuantity,
    });
  }
}

/** "to taste" or "2.5g". */
export function shoppingItemQuantityText(item: ShoppingItem): string {
  if (item.toTasteOnly) return "to taste";
  const qty =
    item.totalQuantity % 1 === 0 ? item.totalQuantity.toString() : item.totalQuantity.toFixed(1);
  return `${qty}${item.unit}`;
}

export function shoppingListToText(
  groups: ShoppingListGroup[],
  totalCost: number,
  unpricedCount = 0,
  pantry: ShoppingListGroup | null = null
): string {
  const lines: string[] = ["SHOPPING LIST", "=============", ""];

  for (const group of groups) {
    lines.push(`## ${group.label}`);
    for (const item of group.items) {
      lines.push(
        `- ${item.name}: ${shoppingItemQuantityText(item)} (${item.unpriced ? "price pending" : `~${item.estimatedCost.toFixed(2)} lei`})`
      );
    }
    lines.push(`  Subtotal: ${formatCost(group.subtotal, group.unpricedCount)}`);
    lines.push("");
  }

  lines.push(`TOTAL: ${formatCost(totalCost, unpricedCount)}`);

  if (pantry && pantry.items.length > 0) {
    lines.push("", "PANTRY CHECK", "============");
    lines.push("Check the cupboard (not in the total):");
    for (const item of pantry.items) {
      lines.push(`- ${item.name}: ${shoppingItemQuantityText(item)}`);
    }
    lines.push(`  Estimate: ${formatCost(pantry.subtotal, pantry.unpricedCount)}, not in the total`);
  }
  return lines.join("\n");
}
