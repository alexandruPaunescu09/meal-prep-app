# Weekly Cooking Plan — Design

## Context

The app already aggregates ingredients across all meal plans for a given week via the Weekly Shopping List. Cooking the food is the missing piece: when a recipe is used by multiple clients in the same week (e.g., 2 portions for one client + 3.6 portions for another), the cook needs to know the **total portions to make** and the **scaled ingredient quantities** without manually editing the base recipe each time.

The Weekly Cooking Plan adds a cross-plan, week-scoped view that mirrors the Weekly Shopping List pattern: aggregate every meal-plan entry for a chosen week, but group by **recipe** (with scaled ingredients and per-client weight breakdown) rather than by ingredient.

## Scope

Cross-plan, week-scoped only. Accessed via a new "Weekly Cooking" button next to "Weekly Shopping" on the Meal Plans list page. No copy-to-clipboard, no PDF export. Persistent per-recipe "cooked" check-offs keyed per week.

## Calculation module — `lib/calculations/cooking-plan.ts`

```ts
export interface CookingPlanRecipe {
  recipeId: string;
  name: string;
  totalPortions: number;          // sum of entry.portions across the week for this recipe
  basePortions: number;           // recipe.portions
  totalFinalWeightG: number | null; // (recipe.final_weight / basePortions) * totalPortions; null when recipe.final_weight is null
  ingredients: Array<{
    ingredientId: string;
    name: string;
    unit: string;
    quantity: number;             // ri.quantity * (totalPortions / basePortions)
  }>;
  clientBreakdown: Array<{
    clientName: string;           // client.name; falls back to plan.name when no client
    portions: number;
    weightG: number | null;       // (recipe.final_weight / basePortions) * portions; null when recipe.final_weight is null
  }>;
}

export interface CookingPlanDirectIngredient {
  ingredientId: string;
  name: string;
  totalQuantity: number;
  unit: string;
}

export function generateCookingPlan(entries: FullEntry[]): {
  recipes: CookingPlanRecipe[];           // sorted alphabetically by name
  directIngredients: CookingPlanDirectIngredient[]; // sorted alphabetically
}
```

`FullEntry` is the same shape used by `generateShoppingList` in `lib/calculations/shopping-list.ts`, extended with `client_name` and `plan_name` so the per-client breakdown can be computed without a second query. The modal already loads `meal_plans` with `client:clients(name)` — we extend the entries select to include `meal_plan:meal_plans(name, client:clients(name))` so each entry knows its source.

Aggregation logic: walk entries; for `entry.recipe`, accumulate `entry.portions` into the recipe's totals and append a `clientBreakdown` row (summing portions per client when the same client has multiple entries for the same recipe). Scale ingredients once at the end using `totalPortions / basePortions`. For `entry.ingredient`, sum `entry.quantity * entry.portions` per ingredient ID. Sort both lists alphabetically.

## UI module — `components/weekly-cooking-modal.tsx`

Clone the shell of `components/weekly-shopping-modal.tsx`:

- Header: title "Weekly Cooking Plan", X close button. **No** copy button.
- Week selector: same dropdown and "Plans included (N): …" line.
- Body:
  - Recipes section (alphabetical). Each recipe is a collapsible row:
    - **Header (always visible)**: checkbox (cooked / not), recipe name, total portions, total final weight in grams (omitted when `totalFinalWeightG` is `null`), expand/collapse chevron. When checked: `opacity-50` + line-through (matches shopping item styling).
    - **Expanded body**:
      - Per-client breakdown: `Mihai — 2 portions · 500 g` (weight omitted when `null`).
      - Scaled ingredients: `Chicken breast — 560 g`, etc.
  - Direct ingredients section (only when `directIngredients.length > 0`) under a "Raw / direct ingredients" heading. Ingredient name + quantity + unit. No checkboxes, no per-client split.
- Footer: omitted (no total cost).

Icon: `ChefHat` from lucide.

Wiring: `app/(authenticated)/meal-plans/meal-plans-client.tsx` gets a "Weekly Cooking" button next to "Weekly Shopping" that mounts the modal, reusing the existing `weeks` memo.

## Persistence — cooked check-offs

Migration `supabase/migrations/20260603000000_cooking_check_state.sql`:

```sql
CREATE TABLE cooking_check_state (
  week_start DATE NOT NULL,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_start, recipe_id)
);
CREATE INDEX cooking_check_state_week_idx ON cooking_check_state (week_start);
ALTER TABLE cooking_check_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage cooking checks"
  ON cooking_check_state FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
```

Mirrors the existing `shopping_check_state` migration. Row presence = checked.

`lib/supabase/types.ts` gains a `CookingCheckState` interface.

`lib/hooks/use-cooking-checks.ts` — copy the structure of `lib/hooks/use-shopping-checks.ts`:

- Signature: `useCookingChecks(weekStart: string | null) → { checkedItems: Set<string> /* recipeIds */, toggle: (recipeId: string) => void }`.
- On `weekStart` change: `SELECT recipe_id FROM cooking_check_state WHERE week_start = $1`.
- `toggle`: optimistic local-state update; if currently checked → `DELETE`, else `INSERT … ON CONFLICT DO NOTHING`.

A new table is justified — different FK target (`recipes` vs `ingredients`) and different domain. Reusing `shopping_check_state` would conflate two unrelated concerns.

## Files

Added:
- `supabase/migrations/20260603000000_cooking_check_state.sql`
- `lib/calculations/cooking-plan.ts`
- `lib/hooks/use-cooking-checks.ts`
- `components/weekly-cooking-modal.tsx`

Modified:
- `lib/supabase/types.ts` — add `CookingCheckState` interface
- `app/(authenticated)/meal-plans/meal-plans-client.tsx` — add "Weekly Cooking" button + modal mount
- `CLAUDE.md` — add changelog entry

## Verification

1. Run the migration locally (`npm run db:reset` or apply migration only).
2. From Meal Plans, click "Weekly Cooking" → modal opens, week dropdown populated from existing plans.
3. Pick a week where two plans share a recipe (e.g., 2 portions in plan A + 3.6 portions in plan B) → recipe header shows `5.6 portions`; expanded body shows scaled ingredient quantities and a per-client breakdown that sums to 5.6.
4. Recipe with `final_weight` set → header shows `X portions · Y g`; per-client rows show grams (proportional). Recipe without `final_weight` → portions only, no grams anywhere.
5. Direct-ingredient entries appear under "Raw / direct ingredients" with totals across the week.
6. Check a recipe → opacity-50 + line-through. Close + reopen the modal → still checked. Switch to another week → that recipe is not checked there. Return → still checked.
7. Sort: recipes alphabetical; direct ingredients alphabetical.
