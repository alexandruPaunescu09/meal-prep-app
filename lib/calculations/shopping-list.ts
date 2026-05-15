import {
  Ingredient,
  Recipe,
  RecipeIngredient,
  MealPlanEntry,
  IngredientCategory,
} from "@/lib/supabase/types";

export interface ShoppingItem {
  ingredientId: string;
  name: string;
  category: IngredientCategory;
  totalQuantity: number;
  unit: string;
  estimatedCost: number;
}

export interface ShoppingListGroup {
  category: string;
  label: string;
  items: ShoppingItem[];
  subtotal: number;
}

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

const CATEGORY_LABELS: Record<string, string> = {
  protein: "Protein",
  dairy: "Dairy",
  grains: "Grains",
  fruits: "Fruits",
  vegetables: "Vegetables",
  fats: "Fats",
  nuts_seeds: "Nuts & Seeds",
  supplements: "Supplements",
  bakery: "Bakery",
  legumes: "Legumes",
  bread_pasta: "Bread & Pasta",
  dessert_sweets: "Dessert & Sweets",
  other: "Other",
};

export function generateShoppingList(entries: FullEntry[]): {
  groups: ShoppingListGroup[];
  totalCost: number;
} {
  const itemMap = new Map<string, ShoppingItem>();

  for (const entry of entries) {
    if (entry.recipe) {
      const recipe = entry.recipe;
      const portionMultiplier = entry.portions / recipe.portions;

      for (const ri of recipe.recipe_ingredients) {
        if (!ri.ingredient) continue;

        const ing = ri.ingredient;
        const quantity = ri.quantity * portionMultiplier;
        accumulateItem(itemMap, ing, quantity);
      }
    } else if (entry.ingredient && entry.quantity) {
      const quantity = entry.quantity * entry.portions;
      accumulateItem(itemMap, entry.ingredient, quantity);
    }
  }

  const items = Array.from(itemMap.values());
  const grouped = new Map<string, ShoppingItem[]>();

  for (const item of items) {
    const group = grouped.get(item.category) ?? [];
    group.push(item);
    grouped.set(item.category, group);
  }

  const groups: ShoppingListGroup[] = Array.from(grouped.entries())
    .map(([category, categoryItems]) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      items: categoryItems.sort((a, b) => a.name.localeCompare(b.name)),
      subtotal: categoryItems.reduce((sum, i) => sum + i.estimatedCost, 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const totalCost = items.reduce((sum, i) => sum + i.estimatedCost, 0);

  return { groups, totalCost };
}

function accumulateItem(itemMap: Map<string, ShoppingItem>, ing: Ingredient, quantity: number) {
  const existing = itemMap.get(ing.id);
  if (existing) {
    existing.totalQuantity += quantity;
    existing.estimatedCost += quantity * ing.price_per_unit;
  } else {
    itemMap.set(ing.id, {
      ingredientId: ing.id,
      name: ing.name,
      category: ing.category,
      totalQuantity: quantity,
      unit: ing.unit,
      estimatedCost: quantity * ing.price_per_unit,
    });
  }
}

export function shoppingListToText(
  groups: ShoppingListGroup[],
  totalCost: number
): string {
  const lines: string[] = ["SHOPPING LIST", "=============", ""];

  for (const group of groups) {
    lines.push(`## ${group.label}`);
    for (const item of group.items) {
      const qty =
        item.totalQuantity % 1 === 0
          ? item.totalQuantity.toString()
          : item.totalQuantity.toFixed(1);
      lines.push(`- ${item.name}: ${qty}${item.unit} (~${item.estimatedCost.toFixed(2)} lei)`);
    }
    lines.push(`  Subtotal: ${group.subtotal.toFixed(2)} lei`);
    lines.push("");
  }

  lines.push(`TOTAL: ${totalCost.toFixed(2)} lei`);
  return lines.join("\n");
}
