# EPIC: Customer Food Diary — MyFitnessPal-style tracking in the portal

**Date:** 2026-10-18
**Status:** Approved. Step 1 (FD-0, FD-1, FD-7) built and integrated on `food-diary/step-1`; not yet merged to `main`.

## Problem

Today the customer portal (`/portal`) shows the plan's meals for a day. Customers can mark each one eaten or skipped and review it, and a single kcal bar counts eaten meals against `calorie_target`. Nothing the customer eats outside the plan is visible, so neither the customer nor the admin can judge real intake.

This epic turns the Today page into a full food diary:
- Plan meals stay pre-filled.
- Customers log extra foods from a curated catalog, by barcode scan, or with quick add.
- Customers see calories, macros and micronutrients against their targets, plus trends and weight progress.
- The admin gets insight into adherence and off-plan eating.

## Story tracker

Update this table as stories land, with the branch or PR and the date.

| ID | Story | Size | Depends on | Status |
|---|---|---|---|---|
| FD-0 | Stop exposing prices and admin notes to customers | S | — | Done 2026-10-18, merged to main with PR #6 (021d9bd) |
| FD-1 | Diary foundation (tables, catalog search, diary API, calc lib, tests) | M | — | Done 2026-10-18, merged to main with PR #6 (021d9bd) |
| FD-2 | Diary day view | M | FD-1 | Done 2026-10-18, merged to main with PR #6 (021d9bd) |
| FD-3 | Log food from the catalog + quick add | M | FD-2 | Done 2026-10-19 on `food-diary/fd-3-log-food` (PR open) |
| FD-7 | Target weight | S | — | Done 2026-10-18, merged to main with PR #6 (021d9bd) |
| FD-4 | Barcode scan to log | M | FD-3 | Done 2026-10-19 on `food-diary/fd-4-barcode` (PR open) |
| FD-5 | Add a product from a nutrition-label photo | L | FD-4 | Built (PR open) |
| FD-12 | Admin food moderation | M | FD-4 | Not started |
| FD-6 | Recents, favorites and copy | S–M | FD-3 | Built (PR open, unmerged) |
| FD-8 | Nutrition details and micronutrients | M | FD-2 | Not started |
| FD-9 | Weight log | S–M | FD-7 | Not started |
| FD-10 | Progress tab: trends and streaks | M | FD-3 (FD-9 optional) | Not started |
| FD-11 | Admin diary insights | M–L | FD-3 (FD-9 for weight) | Not started |

## Product decisions

| Topic | Decision |
|---|---|
| Where scanned products live | A new shared `foods` catalog, separate from the priced `ingredients`. OFF-sourced products are visible to all customers right away. The admin can fix, hide or merge them, or promote one to an ingredient. |
| Who can add foods | Customers never type nutrition values. New foods come only from a barcode scan (Open Food Facts) or from a nutrition-label photo read by Claude. |
| Barcode not in OFF | The customer photographs the nutrition label. Claude extracts the values, and the customer confirms or retakes; the values are read-only. The food is **private to its creator until the admin verifies it**. |
| Quick add | Allowed: kcal plus optional P/C/F. It is stored only in that customer's diary, never in the catalog. |
| Plan meals in totals | **They count only when marked eaten** (current behaviour). To soften this:<br>- a "Mark remaining as eaten" action<br>- an optional eaten-portion factor (0.5×, 1.5×)<br>- a "planned" projection showing what the day totals if every remaining plan meal is eaten |
| Macro targets | A new **target weight**. Protein and fat per kg are multiplied by `target_weight_kg ?? weight_kg`. Example: a 95 kg client aiming for 80 kg gets macros calculated on 80 kg. |
| Weight logs | Customers log their weight and the history is kept. `clients.weight_kg` is NOT overwritten automatically. The admin sees the latest logged weight with a "Use as current weight" action. |
| In scope | Diary, catalog search, barcode, label photo, quick add, recents/favorites/copy, nutrition and micronutrient detail, target weight, weight log, trends and streaks, admin diary insights, admin food moderation. |
| Out of scope (parking lot) | Water tracking, exercise/steps, Health Connect/Apple Health, AI plate-photo estimation, saved "My Meals" combos, reminders/push, online OFF/USDA text search, customer self-edit of targets. |

## Current state (as of `main` at `73e1f3c`)

These findings drive the design.

- **Price leak (existing).** RLS gives customers SELECT on all columns of two tables. With their own session they can query these columns through PostgREST. A diary search widens catalog exposure, so FD-0 fixes this first.
  - `ingredients`, including `package_price` and `price_per_unit`.
  - `recipes`, including the admin `notes`.
- **Middleware.** It blocks customers from `/api/nutrition/*`.
  - All new customer endpoints go under `/api/portal/*`, which middleware already restricts to customers.
  - Each route re-checks auth using the pattern in `app/api/portal/status/route.ts`.
- **Barcode.**
  - `components/barcode-scanner.tsx` can be reused as is (`onDetected`/`onClose`, manual entry).
  - `lookupBarcode()` in `lib/nutrition/open-food-facts.ts` returns values per 100 g with 13 micronutrients. It also returns package size, but **no serving size**; add the `serving_size` and `serving_quantity` fields.
  - `ingredients.barcode` has no index or unique constraint.
- **Units.** There is no grams-per-piece concept, and the calculations silently treat `buc` as grams. The diary logs in g/ml, by serving (when known) or by recipe portion.
- **Calculations.**
  - `calculateRecipe()` (`lib/calculations/recipe.ts`) and the direct-ingredient branch of `calculateDay()` (`lib/calculations/meal-plan.ts`) already aggregate all macros and micros.
  - The portal's `entryNutrition()` (`lib/portal/entry-helpers.ts`) drops everything except 5 fields.
  - The portal never calls `resolveTargets()`; it only gets `calorie_target`.
- **Offline.** `lib/portal/write-queue.ts` is a localStorage queue whose de-dupe key assumes `meal_plan_entry_id`. Diary writes use client-generated UUIDs and upsert by id, so replays are idempotent.
- **Dates.** The Today page's default `?date=` uses the server's date, which is UTC on Vercel. The diary must key on the customer's local date (use the `lib/format.ts` helpers).
- **Gaps.** There is no admin client detail page (`/clients` is a list only), no chart library and no test runner.
- **Claude.** It is already integrated for invoices (`lib/invoices/parse.ts`: beta Messages, zod structured output). The label reader follows the same pattern.

## Shared data model (introduced across stories)

**`foods`** (FD-1)
- `id`
- `barcode` UNIQUE NULL
- `name`, `brand`
- `unit` g|ml
- the 8 per-100 nutrient columns (same as `ingredients`), plus `micronutrients` jsonb
- `serving_size`, `serving_label`, `package_size`
- `source` off|label_photo|admin
- `status` active|pending|hidden
- `created_by_client_id` → clients SET NULL
- `verified_at`
- `promoted_ingredient_id` → ingredients SET NULL
- timestamps

RLS:
- Admin has full access.
- Customers can SELECT rows with `status='active'`, or with `status='pending' AND created_by_client_id = current_client_id()`.
- Customers cannot write. Inserts go through `/api/portal/foods/*` with the service client after validation.

**`food_log_entries`** (FD-1)
- `id`, generated on the client
- `client_id`
- `log_date` DATE (the customer's local date)
- `meal_type`
- exactly one of `food_id`, `ingredient_id` or `recipe_id`, or a quick add
- `quantity` + `quantity_unit` g|ml|serving|portion
- a **nutrition snapshot** computed server-side at log time: name, brand, the 8 nutrients, micronutrients
- timestamps
- index on `(client_id, log_date)`

RLS: customers manage their own rows, and the admin can SELECT.

**Other additions**

| Addition | Story | Notes |
|---|---|---|
| `meal_entry_status.portion_factor` | FD-2 | NUMERIC NULL |
| `clients.target_weight_kg` | FD-7 | NUMERIC NULL |
| `weight_logs(client_id, log_date, weight_kg)` | FD-9 | UNIQUE per day |
| `food_favorites(client_id, food_id \| ingredient_id \| recipe_id)` | FD-6 | |
| Bucket `food-label-photos` | FD-5 | Private, `{client_id}/…`, plus a small rate-limit log |
| `lib/nutrition/nutrients.ts` | FD-1 | Nutrient key registry with labels and units, plus EU reference intakes (Reg. 1169/2011 Annex XIII): NRVs for the 14 micro keys in use; RIs for sugar 90 g, sat fat 20 g, salt 6 g |
| `lib/calculations/diary.ts` | FD-1 | `nutritionForAmount()` and `calculateDiaryDay(planEntries, statuses, logEntries)`, returning the existing `DayTotals` type plus a projected total |

## User stories

Sizes: S ≈ ½ day, M ≈ 1–2 days, L ≈ 3+ days. Each story ships:
- its own migration, timestamped after `20261018000000`
- types
- a `CLAUDE.md` update and changelog row
- a tracker update in this file

### Milestone 1: "Track it" (MVP)

#### FD-0: Stop exposing prices and admin notes to customers (S, no dependencies)
As the admin, I want customers unable to read ingredient prices or recipe notes, so that my costs and margins stay private.
- Remove the customer SELECT policies on `ingredients` and `recipes`.
- Add views without prices or notes (`ingredients_public`, `recipes_public`), filtered to `current_client_id() IS NOT NULL OR is_admin()`.
- Point the portal reads at the views: `app/(portal)/portal/page.tsx`, `plans/[id]/page.tsx` and the meal detail sheet.
- Confirm that PostgREST embedding works through the views. If it doesn't, fall back to service-client reads after the ownership check.

**Acceptance:** with a customer session, `select package_price from ingredients` returns nothing or an error, and the portal still renders meals, ingredients and nutrition.

#### FD-1: Diary foundation (M, no dependencies; can run in parallel with FD-0 and FD-7)
As a developer, I want the catalog, the diary tables and the shared logic in place, so that the UI stories only build screens.
- Add the `foods` and `food_log_entries` migrations with RLS, following the house pattern in `20260609000002_meal_reviews.sql`. Add their types to `lib/supabase/types.ts` and zod schemas.
- Add `lib/nutrition/nutrients.ts` (registry and EU reference intakes) and `lib/calculations/diary.ts`.
- Widen the portal's per-entry nutrition to the full `DayTotals`, reusing `calculateRecipe` and the `calculateDay` math.
- `GET /api/portal/foods/search?q=` returns a unified `CatalogItem` list with no prices. It covers:
  - active foods
  - the customer's own pending foods
  - ingredients
  - recipes that have appeared in the customer's plans
- `POST/DELETE /api/portal/diary` upserts by id and computes the snapshot server-side. Quick-add values are validated (kcal 0–5000).
- Add `diary-upsert` and `diary-delete` kinds to `write-queue.ts`, keyed by entry id.
- Add vitest, with unit tests for `diary.ts` and the nutrient math.

**Acceptance:**
- `npm run db:reset` runs clean.
- RLS checks pass: a customer can't see another customer's entries or anyone's pending foods.
- The tests pass.

#### FD-2: Diary day view (M, depends on FD-1)
As a customer, I want my day laid out like a food diary, with my plan meals pre-filled and my totals against targets, so that I know where I stand.
- The Today page has sections for Breakfast, Lunch, Dinner and Snacks. Each section holds:
  - the plan meal cards (existing `MealCard`, eaten/skipped)
  - that meal's logged entries
  - a "+ Add" button that opens FD-3
- Summary header:
  - kcal eaten / target / remaining
  - P/C/F bars and a fiber range, all from `resolveTargets`
  - a "Planned" ghost marker showing the projection
- Eaten totals are the plan meals marked eaten × `portion_factor`, plus the logged entries.
- Targets come from the plan covering the date. If there is none, use the latest earlier plan; failing that, use `clients.calorie_target` only.
- "Mark remaining as eaten" works for the day. "Ate a different amount" on an eaten plan meal sets `portion_factor`, which extends the status API.
- The diary works on days with no plan, so the scrubber and calendar allow any past date. Logging is allowed for today and past days only.
- The default date is the customer's local date, which fixes the server-UTC default.
- Notes from step 1:
  - Replace the portal's 5-field `entryNutrition` (`lib/portal/entry-helpers.ts`) with `planEntryNutrition` / `calculateDiaryDay` from `lib/calculations/diary.ts`.
  - Today's empty-day hint ("Go to …") points at the nearest day *covered by a plan*, not the nearest day *with meals*, so it can send customers to another empty day. Fix it in the rewrite.
  - Diary snapshots are stored unrounded (e.g. `1.6500000000000001`), so always format them for display.

**Acceptance:** totals match a hand calculation for a mixed day (plan meals, extras, a skipped meal and a 0.5× portion), and the page works offline from cache.

#### FD-3: Log food from the catalog + quick add (M, depends on FD-2)
As a customer, I want to find a food, pick an amount and add it to a meal in a few taps, so that logging isn't a chore.
- The add-food sheet (`Modal variant="sheet"`) has a debounced search with `useListboxNav`. Result rows show:
  - name and brand
  - kcal per 100 g or per serving
  - an "unverified" badge on the customer's own pending foods
- The amount picker offers g/ml, serving (when `serving_size` is known) or portion (recipes), with a live macro preview.
- The meal type defaults to the section that was tapped, or else to the time of day.
- Tapping an entry opens edit: amount, meal, and delete with an undo toast.
- The quick add tab takes a name (optional), kcal, and optional P/C/F.
- Offline, writes are queued and the sync chip shows them. Search shows "needs connection".

**Acceptance:**
- Add, edit and delete round-trip.
- An entry added offline appears after reconnect without duplicating.
- Customers never see prices.

#### FD-7: Target weight (S, no dependencies)
As the admin, I want to set a client's goal weight so that macro targets are computed on the goal (95 → 80 kg), not on the current weight.
- Add `clients.target_weight_kg`. `resolveTargets` uses `target_weight_kg ?? weight_kg`, which affects the admin grid, the portal and any PDF targets.
- Add the field to the client form in `clients-client.tsx`.
- Add an optional "Goal weight" field to intake (`app/intake/page.tsx`, `app/api/intake/route.ts`), following the sparse-update rule.
- The portal profile shows current weight vs goal.
- The grid summary labels the basis ("targets on 80 kg goal weight").

**Acceptance:** protein and fat targets change when the goal is set, and the label is shown.

### Milestone 2: "Scan it"

#### FD-4: Barcode scan to log (M, depends on FD-3)
As a customer, I want to scan a packaged product and log it, so that I don't have to search for it.
- Add a Scan button in the add-food sheet that reuses `BarcodeScanner`.
- `GET /api/portal/foods/barcode?code=` checks these sources in order:
  1. a `foods` barcode match (active, or the customer's own pending)
  2. an `ingredients` barcode match, returned without prices
  3. OFF `lookupBarcode`
- An OFF result must have per-100 data, kcal and P/C/F. If it passes, insert it into `foods` (status active, source off, using the service client) and return the food. On a barcode conflict, return the existing row instead. Otherwise return 404 with a reason, which leads into FD-5.
- Extend the OFF fields with `serving_size` and `serving_quantity`, and map them to `foods.serving_*`.
- Limit each customer to at most 30 new foods per day.
- Add a unique index on `foods.barcode` and a plain index on `ingredients.barcode`.

**Acceptance:**
- A known barcode logs instantly.
- A new OFF barcode creates exactly one food, which other customers can then find.
- An unknown barcode offers the label photo.

#### FD-5: Add a product from a nutrition-label photo (L, depends on FD-4)
As a customer, I want to photograph the label when a scan finds nothing, so that local products can still be logged.
- The customer captures a photo of the label (required) and of the front (optional). Images are compressed with `compressImage` from `lib/portal/storage.ts` and stored in the `food-label-photos` bucket.
- `POST /api/portal/foods/label` sends the photos to Claude:
  - Follow the pattern in `lib/invoices/parse.ts`.
  - The model comes from the env var `LABEL_PARSER_MODEL`, default `claude-haiku-5-5`.
  - Read the `claude-api` skill before coding.
- Claude extracts:
  - name and brand
  - per-100 values, converted from per-serving when needed
  - serving size
  - package size
- The review screen is read-only, with Confirm or Retake.
- Confirm creates a `foods` row (status pending, source label_photo) linked to the scanned barcode and visible only to its creator, then logs it.
- Limit each customer to at most 10 label parses per day.

**Acceptance:**
- A real Romanian label parses correctly.
- The pending food is invisible to another customer.
- It appears in the FD-12 queue.

#### FD-12: Admin food moderation (M, depends on FD-4; finishes alongside FD-5)
As the admin, I want to review customer-added products, so that the shared catalog stays accurate.
- A new page at `/ingredients/foods`:
  - filters: Pending / Active / Hidden, source, creator
  - columns: usage count, created date
  - the label photo is viewable
- Actions:
  - Verify (pending → active), edit nutrition, hide.
  - Merge a duplicate: repoint `food_log_entries.food_id` and favorites. The snapshots are untouched.
  - **Promote to ingredient:** opens `IngredientForm` prefilled through its `defaults` prop, and the admin adds a price. This sets `promoted_ingredient_id`, and search then shows the ingredient instead of the food.
- A pending-count badge appears in the sidebar and in the dashboard's "needs attention" list.

**Acceptance:**
- Verifying a pending food makes it searchable for everyone.
- A promoted food shows up as the ingredient.

#### FD-6: Recents, favorites and copy (S–M, depends on FD-3)
As a customer, I want my usual foods one tap away, so that repeat logging is fast.
- The add-food sheet opens on two lists:
  - Recent: distinct items from the last 30 days, remembering the last amount.
  - Favorites: a star toggle, stored in `food_favorites`.
- "Log again" on an entry.
- "Copy meal from…" copies a section's extras from yesterday or from a picked date.

**Acceptance:** a food logged yesterday appears first under Recent with yesterday's amount.

### Milestone 3: "See progress"

#### FD-8: Nutrition details and micronutrients (M, depends on FD-2)
As a customer, I want a full nutrition breakdown for my day, so that I can see more than calories.
- A day "Nutrition" sheet with:
  - the macro split (% of kcal)
  - sugar, sat fat and salt against EU reference intakes
  - micronutrients as % NRV bars
  - a per-meal breakdown
- A coverage note ("micronutrient data for 5 of 9 items") and the existing disclaimer text from the PDF.
- Item detail shows its label, per 100 and per serving.

**Acceptance:**
- The numbers equal the sum of the item snapshots.
- Items without micros are excluded from the coverage count.

#### FD-9: Weight log (S–M, depends on FD-7)
As a customer, I want to log my weight and see progress toward my goal.
- `weight_logs` holds one entry per day (upsert).
- Quick entry from the Progress tab, with an optional prompt on Mondays.
- A line chart with a goal-weight reference and the change since the first log.
- Admin side, in FD-11 or on the client card until then: the latest logged weight, with a "Use as current weight" action that updates `clients.weight_kg`.

**Acceptance:**
- A second log on the same day upserts.
- The goal line is drawn from `target_weight_kg`.

#### FD-10: Progress tab: trends and streaks (M, depends on FD-3; shows the FD-9 chart if present)
As a customer, I want to see my week and month at a glance, so that I stay motivated and on target.
- A new tab at `/portal/progress`:
  - add it to `components/portal/nav-items.ts` and make `BottomTabs` 4 columns
  - add it to `APP_SHELL` in `public/sw.js` and bump `CACHE_VERSION`
- Daily kcal bars against a target line, and average macros against targets, over 7 and 30 days.
- Plan adherence (eaten / skipped / unmarked) and the off-plan kcal share.
- A logging streak, current and best. A day counts if it has at least one eaten plan meal or at least one entry.
- Charts are hand-rolled SVG, with no new dependency. Read the `dataviz` skill before building them.

**Acceptance:** the stats match the diary data over a seeded fortnight.

#### FD-11: Admin diary insights (M–L, depends on FD-3; the weight section depends on FD-9)
As the admin, I want to see what each client actually eats, so that I can adjust plans and coach them.
- A new route `/clients/[id]`, linked from client cards, with:
  - average kcal and macros vs targets over the last 7 and 30 days, and adherence %
  - the top off-plan foods
  - a day-by-day table that drills into a read-only diary view, reusing the portal day components
  - the weight trend and goal
- A dashboard "needs attention" item when a client hasn't logged for 3+ days.
- Cached reads live in a new `lib/data/client-diary.ts`, using the `unstable_cache` + tag pattern. Portal diary writes call `revalidateTag`.

**Acceptance:** the admin view matches the customer's diary for the same day.

## Recommended order and parallelism

1. **Parallel start:** FD-0, FD-1 and FD-7. They touch different files.
2. **Then FD-2 → FD-3, one after the other.** Both reshape `today-client.tsx`. This completes the **MVP release**.
3. **FD-4 → FD-5 + FD-12.** FD-6 can run alongside FD-4.
4. **FD-8 and FD-9, then FD-10 and FD-11.** FD-10 and FD-11 can run in parallel.

**Branching:** the UX overhaul (PR #4) is merged into `main` at `73e1f3c`. Cut each story branch from `main` as `food-diary/fd-N-<slug>`.

## How to work a story

1. Start a session for the story and plan it first, using this spec plus the code at the time.
2. Build on its own branch, then open a PR.
3. Update `CLAUDE.md`: schema, API routes and changelog.
4. Update the tracker table above.

## Verification (per story)

- `npm run db:start` + `npm run db:reset` replays every migration cleanly.
- RLS checks with a customer session:
  - the customer's own rows vs another customer's rows
  - pending foods
  - no price columns
- `npm run lint` and `npm run build` pass. From FD-1 onward, vitest passes too.
- Check the portal in the browser at the mobile preset (375×812) and at desktop width, including offline queue replay.
- Test the barcode flow on a phone over LAN with `next dev --experimental-https`.
- Migrations reach prod only through the migrate workflow on merge to `main`. Never use the SQL editor.
