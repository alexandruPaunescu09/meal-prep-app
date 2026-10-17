import type { Ingredient, IngredientAlias, ParsedInvoiceLine } from "@/lib/supabase/types";

type CatalogIngredient = Pick<
  Ingredient,
  "id" | "name" | "unit" | "quantity_purchased" | "package_price" | "price_per_unit"
>;

/** Pure post-processing of model output against the catalog and stored aliases. */
export function postProcessLines(
  lines: ParsedInvoiceLine[],
  store: string,
  ingredients: CatalogIngredient[],
  aliases: Pick<IngredientAlias, "ingredient_id" | "store" | "alias">[],
): ParsedInvoiceLine[] {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const storeKey = store.trim().toLowerCase();
  const aliasMap = new Map<string, string>();
  for (const a of aliases) {
    if (a.store.trim().toLowerCase() === storeKey) {
      aliasMap.set(a.alias.trim().toLowerCase(), a.ingredient_id);
    }
  }

  return lines.map((l) => {
    const line = { ...l };
    if (line.package_price != null) line.package_price = Math.round(line.package_price * 100) / 100;
    // Never trust ids that are not in the catalog.
    if (line.ingredient_id && !byId.has(line.ingredient_id)) {
      line.ingredient_id = null;
      line.match_confidence = null;
    }
    // Exact alias hit overrides the model.
    const aliasId = aliasMap.get(line.raw_name.trim().toLowerCase());
    if (aliasId && byId.has(aliasId)) {
      line.ingredient_id = aliasId;
      line.match_confidence = "high";
    }
    if (line.ingredient_id) {
      const ing = byId.get(line.ingredient_id)!;
      if (line.package_unit && line.package_unit !== ing.unit) {
        const extra = `Unit mismatch: receipt ${line.package_unit} vs ingredient ${ing.unit}`;
        line.note = line.note ? `${line.note}; ${extra}` : extra;
        line.ingredient_id = null;
        line.match_confidence = null;
      }
    } else {
      line.match_confidence = null;
    }
    return line;
  });
}

export function newPricePerUnit(
  packagePrice: number | null,
  packageQuantity: number | null,
): number | null {
  if (packagePrice == null || !packageQuantity || packageQuantity <= 0) return null;
  return packagePrice / packageQuantity;
}

export function changePct(oldPpu: number | null, newPpu: number | null): number | null {
  if (oldPpu == null || newPpu == null || oldPpu <= 0) return null;
  return ((newPpu - oldPpu) / oldPpu) * 100;
}
