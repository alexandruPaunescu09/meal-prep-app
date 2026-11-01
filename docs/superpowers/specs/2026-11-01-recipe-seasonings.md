# EPIC: Recipe seasonings — a "Seasonings" section on recipes

**Date:** 2026-11-01
**Status:** SE-0 done. SE-1…SE-5 are open.

## Problem

Today a seasoning is an ordinary recipe line. `recipe_ingredients` is `(id, recipe_id, ingredient_id, quantity NOT NULL)` (`supabase/migrations/20250101000000_initial_schema.sql:53-58`). There is no section, no "to taste" and no spices category. Four things go wrong:

- **Imports lose them.** The recipe import marks "după gust" / "to taste" / pinch lines optional and starts them unticked (`lib/recipes/import/postprocess.ts:36,102,114`; `map.ts:57,73`). Most imported recipes end up with no salt, pepper or herbs.
- **Customers see noise.** The portal meal sheet lists every line with scaled grams (`components/portal/meal-detail-sheet.tsx:157-171`), so "Salt 3 g" sits next to the chicken.
- **The shopping list over-asks.** Salt and oil are added every week as things to buy (`lib/calculations/shopping-list.ts:51-57`).
- **No honest way to write "to taste".** The save RPC rejects any quantity <= 0 (`20261030000100_recipe_source_steps.sql:80`), so the admin must invent a number.

This epic adds a Seasonings section per recipe. The admin lists spices, herbs, salt, oil, garlic and similar in their own list, with an amount or "to taste". Customers see one line of names. The shopping list moves them to a collapsed "Pantry check" group.

## Product decisions (fixed, agreed with the user)

| Topic | Decision |
|---|---|
| What counts as a seasoning | Spices, dried and fresh herbs, salt, pepper, plus flavouring liquids, aromatics and condiments: oil, lemon juice, lime juice, garlic, ginger, vinegar, sauces (soy sauce, mustard…). |
| Never a "doesn't count" flag | A seasoning is a SECTION (a role), not an exclusion. A weighed seasoning counts fully in cost and nutrition. Salt is a tracked nutrient against the EU RI in the nutrition sheet, and 10 g of oil is about 88 kcal. |
| Customers | They see seasonings, as ONE line "Seasoned with: smoked paprika, garlic, thyme" (names only, no grams) on the portal meal sheet and in the PDF. Main ingredients keep their scaled amounts. |
| Shopping list | Seasonings go to a collapsed "Pantry check" group at the bottom, not the normal buy groups. |
| No blends | No spice mixes, no recipe-in-recipe. Seasonings are plain listed lines. |

## Current state (verified against the code on `main` at `d334919`)

- **Table.** `recipe_ingredients` has no unique constraint on `(recipe_id, ingredient_id)`, only indexes on each FK (`20250101000000_initial_schema.sql:95-96`). The same ingredient can already appear twice in a recipe at DB level. The UI stops it (`usedIds` in `components/recipe-form.tsx:180-183`, `addIngredient` at line 222). The import sums duplicate lines (`lib/recipes/import/draft.ts:143`, `mergeNote` at 171).
- **RLS.** `recipe_ingredients` has "Admin full access" and "Customer read" (`current_client_id() IS NOT NULL`), whole-row, no column grants (`20260609000001_rls_role_aware.sql:34-38`). New columns on it are readable by customers automatically. They hold no price. Portal reads select `*` on `recipe_ingredients` (`app/(portal)/portal/page.tsx:108`, `plans/[id]/page.tsx:45`, `lib/portal/progress-loader.ts:22`), so the new columns arrive with no query change.
- **Latest `save_recipe`** is in `supabase/migrations/20261030000100_recipe_source_steps.sql:29-125`. It validates each line (`quantity` > 0, lines 73-83), deletes and re-inserts `recipe_ingredients` with only `(recipe_id, ingredient_id, quantity)` (lines 113-118). Missing keys are not defaulted by the caller, so a stale caller would silently reset every line to main (the same trap as RI-0b). `save_imported_recipe` forwards `p_ingredients` unchanged to `save_recipe(NULL, …)` (`20261030000300_save_imported_recipe.sql:27`), so it needs no SQL change for the columns.
- **Callers of `save_recipe`:** `components/recipe-form.tsx` (submit), the clone in `app/(authenticated)/recipes/recipes-client.tsx:172-175`, and `buildSavePayload` in `lib/recipes/import/draft.ts:164`. Types: `SaveRecipeIngredientInput` (`lib/supabase/types.ts:349`) and `RecipeIngredient` (line 72).
- **Public views.** `ingredients_public` is defined in `20261030000000_ingredient_piece_weight.sql:11-18` with explicit price-free columns. `recipes_public` has no ingredient lines. The role lives on the line, and the line is read through `recipe_ingredients`, so `is_seasoning` does NOT need to go on `ingredients_public`. Nothing price-related is added to any view.
- **Zero-quantity trap in cost math.** `calculateRecipe` registers an unpriced ingredient before looking at the quantity (`lib/calculations/recipe.ts:52-53`), and `accumulateItem` in the shopping list sets `unpriced` from the price alone (`shopping-list.ts:92,100-101`). A to-taste line (quantity 0) on a price-pending ingredient would wrongly raise "N without a price". Both must ignore quantity 0.
- **Scale rounding trap.** `roundScaled` makes g/ml under 100 round to the nearest 5 with a minimum of 5 (`lib/recipes/scale.ts:59-60`). A 2 g salt line would become 5 g. Seasonings need a finer step.
- **Prep.** `getIngredientsFromEntry` pushes every line (`lib/calculations/prep.ts:104-111`), so a 0 line would create a 0 g prep task.
- **Import review.** `include = !isHeader && !optional` (`postprocess.ts:114`). The structured-output schema has no nullable fields, only sentinels (`lib/recipes/import/schema.ts:5-29`). Session drafts use a zod `line` object (`session.ts:11-18`) that strips unknown keys, so older drafts restore fine as long as new fields get defaults.
- **Categories.** `ingredient_categories` is a table seeded in `20250517000000_categories_table.sql:11-24`. There is no spices category. The admin can add one in the UI, or a migration can.

### Readers of `recipe_ingredients` (classification)

"Math only" = a 0-quantity to-taste line contributes nothing, so no change except where noted. "Display" = needs a change.

| File | Kind | Note |
|---|---|---|
| `lib/calculations/recipe.ts` | Math | Fix: skip unpriced registration when quantity is 0 (SE-0) |
| `lib/calculations/meal-plan.ts:69` | Math | Check it does not register unpriced at 0 quantity (SE-0) |
| `lib/calculations/diary.ts:148`, `lib/data/client-diary.ts:60`, `lib/portal/catalog.ts:16,128-138`, `lib/portal/progress-loader.ts` | Math | Per-portion nutrition for customers. Seasonings count. Select only `quantity`, unchanged |
| `lib/calculations/shopping-list.ts:51` | Display + math | Pantry group (SE-3) |
| `lib/calculations/cooking-plan.ts:88,125-133` | Display | Seasonings sub-list (SE-2) |
| `lib/calculations/prep.ts:104` | Math | Skip `to_taste` lines (SE-2) |
| `lib/recipes/scale.ts`, `components/scale-recipe-modal.tsx` | Math + display | Role-aware rounding, to-taste lines stay out (SE-2) |
| `lib/data/recipes.ts:35-40` | Query | Lists columns explicitly: add `role`, `to_taste` (SE-0) |
| `lib/data/meal-plans.ts:101`, `components/weekly-shopping-modal.tsx:116`, `components/weekly-cooking-modal.tsx:125`, `app/(authenticated)/prep/prep-client.tsx:117`, `app/api/export/meal-plan/route.ts:33` | Query | Use `*`, columns arrive free |
| `components/recipe-form.tsx` | Display | Second list, toggle, warning (SE-1) |
| `app/(authenticated)/recipes/recipes-client.tsx:85,172,199,404-407,561-564` | Display + clone | Expanded rows show sections; clone copies role and to_taste (SE-0 for the clone payload, SE-2 for display) |
| `components/portal/meal-detail-sheet.tsx:157-171` | Display | "Seasoned with" (SE-4) |
| `app/api/export/meal-plan/route.ts:50-63`, `lib/pdf/meal-plan.tsx:33,98` | Display | "Seasoned with" (SE-4) |
| `app/(authenticated)/ingredients/ingredients-client.tsx:227` | Query | Only checks which recipes use an ingredient. No change |
| `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx:69,325,374` | Types / math | Does not list recipe lines. Uses the shopping panel (SE-3) |
| `lib/data/dashboard.ts` / "needs attention" | Math | Ingredient price counts only. No change |

## Design

### Data model (migration `20261101000000_recipe_seasonings.sql`)

**`recipe_ingredients`**
- `role TEXT NOT NULL DEFAULT 'main' CHECK (role IN ('main','seasoning'))`
- `to_taste BOOLEAN NOT NULL DEFAULT false`
- `CHECK (NOT to_taste OR (role = 'seasoning' AND quantity = 0))` named `recipe_ingredients_to_taste_valid`
- `quantity` stays NOT NULL. A to-taste line stores 0, so every cost, nutrition, shopping and cooking calculation keeps working (0 adds nothing). Only the display says "to taste" instead of "0 g".
- Existing rows become `role = 'main'`, `to_taste = false`. No backfill. The admin moves lines when editing.

**`ingredients`**
- `is_seasoning BOOLEAN NOT NULL DEFAULT false`. Meaning: "usually a seasoning". It only sets the DEFAULT role when the ingredient is added to a recipe. The line's own `role` is the truth.
- Not added to `ingredients_public`. Reason: customers need the line role, which is on `recipe_ingredients`. The catalog and diary never use it.

**Why on the line, not the ingredient:** the same ingredient can be main in one recipe (garlic soup, 8 cloves) and a seasoning in another. Why still have `is_seasoning`: so oil, garlic and lemon land in the right section by default without changing their categories.

**Category "Spices & Herbs":** recommended YES, as a separate small migration `20261101000100_spices_herbs_category.sql` (slug `spices_herbs`, name "Spices & Herbs", sort_order 13, `ON CONFLICT (slug) DO NOTHING`), shipped with SE-1. It helps the admin organise a long list. It is NOT required: the feature never reads the category, and the Pantry group is not category based. The ingredient form pre-ticks "Usually a seasoning" when a NEW ingredient's category is set to `spices_herbs` (the admin can untick it).

**Same ingredient twice:** no DB unique constraint is added (legacy rows may already have duplicates, and one line per role is the rule, not per ingredient). Rules:
- In the recipe form, an ingredient may appear once per section (once as main, once as seasoning). Adding it a second time to the same section is blocked as today.
- In `buildSavePayload`, lines are summed within the same `(ingredient, role)` and kept separate across roles. The "added up" note names only the merged ones. If a to-taste line and a weighed line merge in the same role, the weighed amount wins and `to_taste` is dropped.

**`save_recipe` changes** (new migration replaces the function, latest definition is the one in `20261030000100`):
- Each line reads `role` (default 'main' when the key is absent or empty; any other value raises `role must be main or seasoning`) and `to_taste` (default false).
- Quantity rule: `to_taste` lines must have quantity 0 (raise otherwise); all other lines still need quantity > 0. A `to_taste` line with role main raises.
- Insert carries `(recipe_id, ingredient_id, quantity, role, to_taste)`.
- Same house pattern: `SECURITY INVOKER`, `is_admin()` guard, EXECUTE revoked from PUBLIC, granted to `authenticated`. TS types require `role` and `to_taste` on `SaveRecipeIngredientInput`, so `tsc` catches a caller that forgets them. Residual risk: a browser tab opened before deploy would send lines without `role` and save them as main. Accepted (admin only, one user).

### Shared pure helper `lib/recipes/seasonings.ts` (tested)

- `splitLines(lines)` -> `{ main, seasonings }`.
- `lineAmountText(line, unit)` -> "to taste" or "3 g" (uses `formatQuantity`).
- `seasonedWithText(lines)` -> "Seasoned with: a, b, c" or null (names deduped, sorted by name, no grams, no price).
- `isCalorieDense(ingredient)` -> `calories > 300` per 100 g. Used by the form warning and the import.
- `defaultRole(ingredient)` -> `is_seasoning ? 'seasoning' : 'main'`.

### Recipe form (SE-1)

- A second list "Seasonings" under Ingredients. Each row: name, amount + unit, "To taste" toggle (disables and clears the amount, stores 0), a Move control ("Move to Ingredients"), remove. Main rows get a "Move to Seasonings" control. Mobile: stacked rows, 40 px targets, `IconButton` with labels.
- Adding an ingredient from the picker uses `defaultRole`. The picker stays one picker; a segmented choice "Add to: Ingredients / Seasonings" sits above it and defaults from the ingredient.
- Quick-add chips above the Seasonings list: the admin's `is_seasoning` ingredients (up to 12, ordered by how many recipes use them if cheap, else by name), one tap adds a line (amount 0 / to taste for salt/pepper/herbs is NOT assumed; see open questions).
- Warning on a to-taste line with a calorie-dense ingredient (> 300 kcal/100 g, e.g. oil): "Not counted in calories — enter an amount". Non-blocking.
- Live cost and nutrition unchanged: seasonings count, to-taste adds 0.
- Validation: at least one MAIN line is required (a recipe of only seasonings is an error). Weighed lines need quantity > 0; to-taste lines skip the check.
- The dirty-guard snapshot (`snapshot` at `recipe-form.tsx:118-145`) includes role and to_taste. Piece-weight warning (`recipe-form.tsx:498`) is skipped for to-taste lines. The "Scale" button keeps only weighed lines (`scaleLines` at 208-214 already filters qty > 0) and passes `role`.

### Customer side (SE-4)

- Meal sheet: "Ingredients" shows MAIN lines as today (scaled grams). Below it, one muted line `seasonedWithText(...)`. If there are only seasonings, no Ingredients heading.
- PDF: the per-recipe "Ingredients: …" line (`lib/pdf/meal-plan.tsx:98`) lists main lines only. A second line "Seasoned with: …". The export route (`route.ts:57-63`) splits the lists. No pricing, as today.
- Customer nutrition, diary snapshots and catalog math do not change. Seasonings keep counting. Existing frozen diary snapshots are untouched.
- Confirmed: `role` and `to_taste` are readable through the existing "Customer read" policy, and no price column is involved. Add a pgTAP assertion that a customer can read both and that `ingredients_public` still has no price or `is_seasoning` column.
- "What's new": recommend YES, one short entry `2026-11-seasonings` added at the top of `RELEASES` (`lib/portal/whats-new.ts`) with SE-4: "Seasonings now show as one line on each meal." No `href`. Follow the CLAUDE.md release-notes rules.

### Shopping list (SE-3)

- `generateShoppingList` returns a separate `pantry` group (or null) next to `groups`. An aggregated ingredient goes to Pantry only when ALL its uses that week are seasoning lines. If it is a main line anywhere that week (including a direct ingredient plan entry), it stays in its normal category group with the FULL total (main + seasoning uses).
- Each item gets `toTasteOnly` (all uses are to-taste, so total is 0). Pantry rows show the week's quantity, or "to taste". They stay checkable (same `shopping_check_state` keyed by week + ingredient, no schema change). `unpriced` is true only when the total quantity is > 0 and the price is NULL.
- Money: the list total and category subtotals EXCLUDE pantry cost. The Pantry group shows its own estimate on its header ("~12,40 lei, not in the total"). Reason: the point of the list is what to buy this week; counting oil you already have makes the total look wrong. Recipe cost and meal-plan selling price ALWAYS include seasonings (they are real cost of goods).
- UI: `shopping-list-panel.tsx` renders Pantry last, collapsed by default (count in the header, "3 of 7 checked" if checks exist). Copy and Print add a separate section "PANTRY CHECK" after the buy groups and "TOTAL" line (`shoppingListToText` gets the pantry group). "Hide checked" and "Clear checks" cover pantry rows too. Used by `weekly-shopping-modal.tsx` and the grid, so both get it from one change.

### Admin displays (SE-2)

- Recipes list: both expanded blocks (`recipes-client.tsx:404-407` and `561-564`) show "Ingredients (n)" then "Seasonings (m)" with "to taste" where it applies. Clone copies role and to_taste (SE-0 payload).
- Cooking plan: `CookingPlanRecipe` gets `seasonings: CookingPlanRecipeIngredient[]` (with `toTaste: boolean`); `ingredients` becomes main only. Quantities scale to the batch as today; to-taste stay "to taste". `weekly-cooking-modal.tsx` renders a "Seasonings" sub-list per recipe, also in the print output.
- Scale (as built, SE-2): the finer rounding (nearest 0.5 under 10 g/ml, minimum 0.5) applies to ANY non-`buc` line under 10, not only seasonings, because callers do not pass a role yet; `ScaleLineInput` gets only an optional `role` (display grouping), and to-taste lines are recognised by quantity 0. Original design: `ScaleLineInput` gets `role` and `toTaste`. To-taste lines are excluded from the scale (not counted, not changed, never trip "a non-zero quantity never becomes 0"). Seasoning lines scale with the rest, but `roundScaled` uses a finer step for seasonings under 10 g/ml: nearest 0.5, minimum 0.5; at or above 10 the existing rule applies. The modal shows seasoning rows under their own sub-heading.
- Prep: `getIngredientsFromEntry` skips `to_taste` lines. A weighed seasoning (garlic 12 g) still gets prep rules (peeling and chopping are real prep).

### Recipe import (SE-5)

- Model schema (`schema.ts`): add `is_seasoning: z.boolean()` and `to_taste: z.boolean()` per line. No nullable fields (booleans only), so the 16-nullable limit is not touched. The existing `optional` flag now means only "an optional ingredient WITH an amount" (garnish, extra nuts).
- Prompt (`map.ts`): define seasoning as in this spec; "after taste / to taste / as needed / a pinch" sets `to_taste: true`; a stated amount (1 tsp, 2 tbsp) is a normal weighed line with the conversion table, even for salt or oil. Add `is_seasoning` hint to the catalog line so the model sees the admin's default.
- Pinch decision: a pinch is `to_taste`, NOT an invented 0.5 g estimate. Reason: false precision. 0.5 g of salt changes nothing, and a made-up weight would still need the "estimate" highlight on every line. Equal treatment of "pinch" and "to taste" is also how the cook reads them.
- Postprocess: `TO_TASTE_RE` (`postprocess.ts:36`) sets `to_taste` as well as the model flag. A to-taste line becomes role seasoning, `to_taste` true, quantity 0, and **include true by default** (it was skipped). Role for other lines: the matched ingredient's `is_seasoning` OR the model's flag. `RecipeImportLine` gets `role` and `to_taste`; the parse route's catalog query selects `is_seasoning`. A to-taste line still needs a matched ingredient to be saved (same rule as other included lines); "Skip all unmatched" works as before.
- Review UI (`import-client.tsx`): each included row has a role control (Ingredient / Seasoning) and a "To taste" toggle; section order main, then seasonings. `lineProblem` skips the quantity check when `toTaste`. Warning for a to-taste calorie-dense line (oil): "Not counted in calories — enter an amount", non-blocking. `canApprove` still needs at least one included MAIN line.
- Save: `buildSavePayload` keys sums by `(ingredient, role)`, emits `role` and `to_taste`, aliases unchanged.
- Session drafts: `REVIEW_SESSION_VERSION` stays 1. New fields get zod defaults (`role` default 'main', `to_taste` default false, on both `base` and the edited line) so an older saved draft restores with all lines as main; add a test with a v1 draft that lacks them. New fields are bounded enums/booleans, so the size cap is unaffected.
- New ingredients created during import open `IngredientForm` with `is_seasoning` pre-ticked when the line is a seasoning.

## Open questions (with recommended defaults)

Defaults accepted by the user on 2026-11-01.

1. **Default amount for a seasoning added with a chip.** Recommend: salt, pepper, dried herbs and spices default to "To taste" ON; oil, garlic, lemon, vinegar and sauces default to a weighed amount (oil 10 g, others 5 g) because they carry calories. Rule: `isCalorieDense` OR `unit = 'ml'` -> weighed, else to taste.
   *SE-1 refinement:* that rule would make garlic "to taste", so `chipDefault` uses the category instead: `spices_herbs` -> to taste (assuming salt and pepper are filed there); otherwise weighed (`buc` 1, calorie-dense 10, else 5). Adding: the Seasonings section has its own "Add Seasoning" picker that always adds as seasoning, replacing the Ingredients/Seasonings segmented choice.
2. **Garlic and lemons bought every week in the Pantry group.** They are perishable and really are bought. Recommend: keep the all-uses-are-seasoning rule exactly as agreed, but let the admin keep an ingredient out of Pantry by making one use a main line. If this feels wrong in practice, a later per-ingredient "always show in buy list" toggle is a small follow-up (not built now).
3. **Oil "for frying" with no amount.** Recommend: import marks it to-taste with the non-blocking calorie warning, and the admin is expected to enter an amount. Not blocking, because the source often gives none.
4. **Role precedence on import** when the catalog says `is_seasoning` and the model says main (or the opposite). Recommend: seasoning wins if EITHER says so; the admin moves it with one tap.
5. **Existing recipes.** Recommend no auto-migration. Optionally the ingredients list gets an `?f=seasoning` filter chip in SE-1 so the admin can tick `is_seasoning` quickly, then move lines per recipe while editing.
6. **Seasonings-only recipes (a sauce).** Recommend blocking save with "Add at least one ingredient" because cooking plan and customer sheet assume a main line. Revisit if the admin wants sauce-only recipes.

## Out of scope (possible later ideas)

- Spice blends / mixes and recipe-in-recipe.
- Allergen tags on seasonings.
- Heat level.
- A per-ingredient "always in buy list" override.
- Showing grams of seasonings to customers.
- Per-customer seasoning preferences ("no cumin").

## User stories

Sizes: S ≈ ½ day, M ≈ 1–2 days. Each story ships its own types, tests, a `CLAUDE.md` update with a changelog row and a tracker update here. Migrations are timestamped after `20261030000300`. DB changes get pgTAP tests in `supabase/tests/` (house pattern: `BEGIN; … ROLLBACK;`, admin + customer + anon).

### Story tracker

| ID | Story | Size | Depends on | Status |
|---|---|---|---|---|
| SE-0 | Schema, save path, types, shared helper | M | — | Done (stacked on spec PR #42) |
| SE-1 | Recipe form section + "Usually a seasoning" + chips + to taste + oil warning | M | SE-0 | Done (PR #47) |
| SE-2 | Admin displays: recipes list, cooking plan, scale, prep | M | SE-0 | Done (PR #46) |
| SE-3 | Shopping list "Pantry check" | M | SE-0 | Open |
| SE-4 | Customer meal sheet + PDF + What's new | S | SE-0 | Open |
| SE-5 | Recipe import mapping and review | M | SE-0, SE-1 | Open |

### Order and parallel work

SE-0 first (everything needs the columns and types). After SE-0, SE-1, SE-2, SE-3 and SE-4 touch disjoint files and can be built in parallel. SE-5 starts after SE-1 merges because both edit the ingredient-form `defaults`/`is_seasoning` field. The only shared edit points are handled by ownership: `components/recipe-form.tsx` belongs to SE-1 (SE-2 only changes `lib/recipes/scale.ts` and tells SE-1 which `role` field `ScaleLineInput` expects); `lib/calculations/recipe.ts` and `meal-plan.ts` belong to SE-0.

### SE-0: Schema, save path, types, shared helper (M)

As the admin, I want recipe lines to carry a role and "to taste", so that later stories have somewhere to store seasonings.
- Migration `20261101000000_recipe_seasonings.sql`: `recipe_ingredients.role`, `.to_taste`, CHECK `recipe_ingredients_to_taste_valid`; `ingredients.is_seasoning`; replaced `save_recipe` (see Design). Do not touch `ingredients_public` or `recipes_public`.
- `lib/supabase/types.ts`: `RecipeIngredient` gets `role: 'main' | 'seasoning'` and `to_taste: boolean`; `Ingredient` gets `is_seasoning: boolean`; `SaveRecipeIngredientInput` gets required `role` and `to_taste`. `lib/validations/schemas.ts`: ingredient schema gets `is_seasoning`.
- `lib/data/recipes.ts`: add `role`, `to_taste` to the explicit column list.
- Both existing callers keep working: `recipe-form.tsx` submit sends the loaded role and to_taste (every row is main until SE-1 adds the UI); the clone (`recipes-client.tsx:172`) copies them; `buildSavePayload` emits `role: 'main', to_taste: false` until SE-5.
- `lib/recipes/seasonings.ts` (helper above) + tests.
- Fix zero-quantity unpriced counting in `lib/calculations/recipe.ts:52` and check `meal-plan.ts:69-81`; tests in `incomplete-cost.test.ts` style.
- pgTAP `supabase/tests/06_recipe_seasonings.sql`: round trip (role and to_taste kept on re-save); CHECK rejects to_taste with role main and to_taste with quantity > 0; `save_recipe` rejects a bad role, a non-to-taste line with quantity 0, a to-taste line with quantity > 0; customer reads both columns on a recipe line; customer cannot write; anon denied; `ingredients_public` has no `is_seasoning` and no price columns; non-admin `save_recipe` still raises `forbidden`.

**Acceptance:** an old recipe edited and re-saved keeps all lines main; a to-taste seasoning with quantity 0 saves through the RPC; `npm run db:reset`, `npm run test:db`, `npm test`, `npx tsc --noEmit` pass.

### SE-1: Recipe form section, ingredient toggle, chips (M)

As the admin, I want to add seasonings in their own list, so that I can write "to taste" without inventing grams.
- `components/recipe-form.tsx`: Seasonings list, role-aware add and move, to-taste toggle, quick-add chips, oil warning, validation, dirty snapshot, piece-weight warning skip (see Design).
- `components/ingredient-form.tsx` + `ingredients-client.tsx`: "Usually a seasoning" checkbox (saved to `is_seasoning`), pre-ticked for a new ingredient in `spices_herbs`; optional `?f=seasoning` filter chip and badge.
- Migration `20261101000100_spices_herbs_category.sql`.
- Tests: unit tests for chip selection/default amount logic in `seasonings.ts`; pgTAP row for the category seed (idempotent).

**Acceptance:** adding olive oil (is_seasoning) puts it in Seasonings; moving it to Ingredients and saving keeps it there; a to-taste salt shows no quantity input and saves as 0; to-taste oil shows the warning; the same ingredient can be in both lists; recipe cost and kcal include a weighed oil line. Browser-check at 375 px.

### SE-2: Admin displays (M)

- `recipes-client.tsx` (both expanded blocks), `lib/calculations/cooking-plan.ts` (+ test), `components/weekly-cooking-modal.tsx` (on screen and print), `lib/recipes/scale.ts` (+ tests: to-taste excluded, 2 g salt stays 2 g or 2,5 g, never 0, mains unchanged), `components/scale-recipe-modal.tsx`, `lib/calculations/prep.ts` (+ test: to-taste skipped, weighed seasoning kept).

**Acceptance:** a recipe with weighed garlic and to-taste pepper shows both under Seasonings in the list and the cooking plan; scaling to a lower kcal target scales oil but leaves pepper "to taste"; no 0 g prep task.

### SE-3: Shopping list Pantry check (M)

- `lib/calculations/shopping-list.ts` (grouping, `toTasteOnly`, unpriced fix, `shoppingListToText`) + tests (all-seasoning goes to pantry; main anywhere stays with full total; to-taste only shows "to taste"; pantry cost not in total; unpriced not counted at 0), `components/shopping-list-panel.tsx`, `components/weekly-shopping-modal.tsx`, grid call sites in `meal-plan-grid.tsx`.

**Acceptance:** a week with salt only as seasoning shows salt under a collapsed Pantry check, not in the buy groups; the same week with a plan entry using salt as main puts it in its category with the combined total; copy and print show the section; checks persist across reload.

### SE-4: Customer meal sheet, PDF, What's new (S)

- `components/portal/meal-detail-sheet.tsx`, `app/api/export/meal-plan/route.ts`, `lib/pdf/meal-plan.tsx`, `lib/portal/whats-new.ts` entry (+ the existing `whats-new.test.ts` still passes). pgTAP read assertion lives in SE-0.

**Acceptance:** the sheet shows main lines with grams and "Seasoned with: smoked paprika, garlic, thyme" with no amounts and no price; the PDF matches; a recipe with no seasonings shows no extra line; day nutrition totals are unchanged by the display change.

### SE-5: Recipe import (M)

- `lib/recipes/import/{schema,map,postprocess,types,draft,session}.ts` and tests, the parse route's catalog query (`is_seasoning`), `app/(authenticated)/recipes/import/import-client.tsx`, `IngredientForm` defaults.
- Tests: "după gust" line becomes seasoning + to_taste + included; pinch becomes to_taste; matched `is_seasoning` ingredient defaults to seasoning; `buildSavePayload` sums within role and keeps roles apart; `canApprove` needs a main line; old v1 session draft restores as all-main; round trip through `save_imported_recipe` (extend `05_save_imported_recipe.sql` with a seasoning line).
- Live check with Haiku 5.5 on the gustos and lauralaurentiu fixtures ("sare și piper după gust").

**Acceptance:** importing the lauralaurentiu page yields salt and pepper as included to-taste seasonings; saving keeps them; the recipe cost and kcal match the main lines plus any weighed seasoning.
