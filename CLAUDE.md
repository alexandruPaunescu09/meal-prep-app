@AGENTS.md

# Meal Prep App — Project Reference

> **IMPORTANT: Update this file with every change made to the project. Add entries to the Changelog section documenting what was changed, when, and why.**

---

## Tech Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.2.6 | App Router, SSR, API routes |
| React | 19.2.4 | UI framework |
| TypeScript | 5 | Strict mode enabled |
| Supabase | @supabase/ssr 0.10.3, supabase-js 2.105.4 | Auth + Postgres database |
| Tailwind CSS | 4 | Styling (@tailwindcss/postcss) |
| Zod | 4.4.3 | Schema validation |
| @dnd-kit/core | latest | Drag-and-drop (meal plan grid) |
| @react-pdf/renderer | latest | PDF generation (meal plan export) |
| Resend | latest | Transactional email (PDF delivery) |
| @vercel/og | 0.11.1 | OG image generation (legacy) |
| Lucide React | 1.14.0 | Icons |
| Vitest | 3.2 | Unit tests for pure `lib/` code (`npm test`) |

---

## Project Structure

```
app/
├── (authenticated)/        # Protected routes (requires login)
│   ├── layout.tsx          # AppShell wrapper (sidebar + nav)
│   ├── page.tsx            # Dashboard
│   ├── ingredients/        # Ingredients CRUD
│   │   ├── categories/     # Category management CRUD
│   │   └── import/         # Receipt/invoice price import (upload → review → approve)
│   ├── recipes/            # Recipes CRUD
│   ├── meal-plans/         # Meal plans list + [id] grid editor
│   ├── prep/               # Prep schedule (weekly view + rules config)
│   ├── clients/            # Clients CRUD
│   └── containers/         # Container types CRUD + client balances
├── api/
│   ├── nutrition/search/   # Nutrition API search (USDA + OFF)
│   ├── nutrition/barcode/  # Barcode lookup (existing ingredient or OFF v2)
│   ├── invoices/parse|apply/ # Receipt/invoice import (stateless parse, atomic apply)
│   ├── portal/foods/search/ # Customer catalog search (price-free foods + ingredients + own-plan recipes)
│   ├── portal/foods/barcode/ # Customer barcode lookup (foods → ingredients → Open Food Facts, inserts new OFF foods)
│   ├── portal/diary/       # Customer food diary upsert/delete (server-side nutrition snapshot)
│   ├── export/meal-plan/   # PDF generation + email delivery
│   ├── intake/             # Public client intake form handler
│   └── og/meal-plan/       # OG image generation (legacy)
├── intake/                 # Public intake form page
└── login/                  # Login page
components/
├── app-shell.tsx           # Sidebar layout wrapper
├── ingredient-form.tsx     # Ingredient create/edit modal
├── recipe-form.tsx         # Recipe create/edit modal (+ container type)
├── nutrition-search.tsx    # Nutrition API search modal
├── barcode-scanner.tsx     # Camera barcode scanner overlay (+ manual entry)
└── delivery-form.tsx       # Container delivery logging modal
lib/
├── supabase/
│   ├── client.ts           # Browser Supabase client (createClient)
│   ├── server.ts           # Server Supabase client (createServer, async)
│   └── types.ts            # All TypeScript interfaces + enums
├── calculations/
│   ├── recipe.ts           # calculateRecipe() → cost + nutrition per portion
│   ├── meal-plan.ts        # calculateDay(), calculateWeek() → aggregated totals
│   ├── shopping-list.ts    # generateShoppingList() → grouped ingredient list
│   ├── cooking-plan.ts     # generateCookingPlan() → recipes (scaled ingredients + per-client breakdown) + direct ingredients
│   ├── containers.ts       # calculateClientBalance(), calculateExpectedReturns(), calculateChargeableAmount()
│   ├── prep.ts             # generatePrepTasks() → weekly prep task generation from meal plans
│   └── diary.ts            # Food diary math: nutritionForAmount, snapshots, calculateDiaryDay (eaten/projected)
├── nutrition/
│   ├── index.ts            # searchNutrition() orchestrator
│   ├── usda.ts             # USDA FoodData Central API
│   ├── open-food-facts.ts  # Open Food Facts API (Romania-first)
│   ├── confidence.ts       # NCS formula (5 components)
│   ├── classification.ts   # Ingredient classification + cooked keywords
│   └── nutrients.ts        # Nutrient registry + EU reference intakes (Reg. 1169/2011 Annex XIII)
├── pdf/
│   └── meal-plan.tsx       # React PDF document component
└── validations/
    └── schemas.ts          # Zod schemas (ingredient, recipe, client)
supabase/
├── config.toml             # Local Supabase config
└── migrations/
    ├── 20250101000000_initial_schema.sql
    ├── 20250513000000_price_history.sql
    ├── 20250514000000_container_types.sql
    ├── 20250514000001_client_contact.sql
    ├── 20250514000002_container_tracking.sql
    ├── 20250515000000_improvements.sql
    ├── 20250516000000_prep_workflow.sql
    ├── 20250517000000_categories_table.sql
    └── 20250518000000_drop_recipe_category.sql
middleware.ts               # Auth check on all routes
```

---

## Database Schema

### Enums
- `meal_type`: breakfast, lunch, dinner, snack

### Tables

**`ingredient_categories`**
- `id` UUID PK, `slug` TEXT UNIQUE, `name` TEXT, `sort_order` INT
- `created_at` TIMESTAMPTZ
- Index: `(sort_order)`

**`ingredients`**
- `id` UUID PK, `name` TEXT, `brand` TEXT (nullable), `category` TEXT (references ingredient_categories.slug by convention)
- `quantity_purchased` NUMERIC, `unit` TEXT (g/ml/buc), `package_price` NUMERIC
- `price_per_unit` NUMERIC **GENERATED** (`package_price / NULLIF(quantity_purchased, 0)`)
- Macros (per 100g): `calories`, `protein`, `carbs`, `fat`, `fiber`, `sugar`, `sat_fat`, `salt`
- `micronutrients` JSONB, `api_source` TEXT, `barcode` TEXT
- `created_at`, `updated_at` TIMESTAMPTZ (trigger-maintained)

**`recipes`**
- `id` UUID PK, `name` TEXT, `portions` INT (default 1), `final_weight` NUMERIC (nullable), `notes` TEXT
- `container_type_id` UUID FK→container_types SET NULL

**`recipe_ingredients`** (junction)
- `recipe_id` FK→recipes CASCADE, `ingredient_id` FK→ingredients RESTRICT, `quantity` NUMERIC

**`clients`**
- `id` UUID PK, `name` TEXT, `email` TEXT, `phone` TEXT
- `calorie_target` INT, `weight_kg` NUMERIC, `target_weight_kg` NUMERIC (nullable, CHECK 30–300; goal weight), `restrictions` TEXT, `allergies` TEXT, `preferences` TEXT, `notes` TEXT
- `container_tolerance` INT (default 2) — max containers a client can have outstanding before being flagged

**`meal_plans`**
- `id` UUID PK, `name` TEXT, `client_id` FK→clients SET NULL, `week_start` DATE, `markup_multiplier` NUMERIC (default 2.5)
- `calorie_target` INT (kcal/day), `protein_per_kg` NUMERIC, `fat_per_kg` NUMERIC — per-plan nutrition targets; macros multiply by `clients.target_weight_kg` when set, else `clients.weight_kg`. Carbs and fiber targets are derived (carbs from calories−protein−fat; fiber as 10–14 g/1000 kcal range).

**`meal_plan_entries`**
- `meal_plan_id` FK→meal_plans CASCADE, `day_of_week` INT (1-7), `meal_type` meal_type
- `recipe_id` FK→recipes RESTRICT (nullable), `ingredient_id` FK→ingredients RESTRICT (nullable), `quantity` NUMERIC (nullable)
- `portions` NUMERIC (supports fractional)
- CHECK: `recipe_id IS NOT NULL OR ingredient_id IS NOT NULL`

**`ingredient_price_history`**
- `ingredient_id` FK→ingredients CASCADE, `package_price`, `quantity_purchased`, `unit`, `price_per_unit`, `recorded_at`
- Index: `(ingredient_id, recorded_at DESC)`

**`container_types`**
- `id` UUID PK, `name` TEXT, `volume_ml` INT, `cost` NUMERIC (replacement cost in lei)
- `created_at` TIMESTAMPTZ

**`container_deliveries`**
- `id` UUID PK, `client_id` FK→clients CASCADE, `meal_plan_id` FK→meal_plans SET NULL
- `delivery_date` DATE, `notes` TEXT, `created_at` TIMESTAMPTZ
- Index: `(client_id, delivery_date DESC)`

**`container_delivery_items`**
- `id` UUID PK, `delivery_id` FK→container_deliveries CASCADE, `container_type_id` FK→container_types RESTRICT
- `quantity_sent` INT, `quantity_returned` INT

**`prep_rules`**
- `id` UUID PK, `ingredient_category` TEXT (nullable), `ingredient_id` FK→ingredients CASCADE (nullable)
- `prep_type` TEXT, `advance_days` INT, `time_estimate_minutes` INT (nullable), `notes` TEXT (nullable)
- CHECK: `ingredient_category IS NOT NULL OR ingredient_id IS NOT NULL`
- Index: `(ingredient_category)`, `(ingredient_id)`

**`prep_tasks`**
- `id` UUID PK, `week_start` DATE, `prep_date` DATE, `cook_date` DATE
- `ingredient_id` FK→ingredients CASCADE, `prep_type` TEXT, `quantity` NUMERIC, `unit` TEXT
- `recipe_names` TEXT[], `completed` BOOLEAN, `completed_at` TIMESTAMPTZ (nullable)
- Index: `(week_start, prep_date)`

**`shopping_check_state`**
- `week_start` DATE, `ingredient_id` FK→ingredients CASCADE, `checked_at` TIMESTAMPTZ
- PK: `(week_start, ingredient_id)`. Row presence = checked. Persists shopping-list check-offs across reloads; keyed per week so checks are shared across all plans for that week.
- Index: `(week_start)`

**`cooking_check_state`**
- `week_start` DATE, `recipe_id` FK→recipes CASCADE, `checked_at` TIMESTAMPTZ
- PK: `(week_start, recipe_id)`. Row presence = recipe marked cooked. Same pattern as `shopping_check_state`, keyed per week so checks are shared across all plans for that week.
- Index: `(week_start)`

**`foods`** (shared consumer-product catalog, no prices; customers never write)
- `id` UUID PK, `barcode` TEXT UNIQUE (nullable), `name` TEXT, `brand` TEXT, `unit` TEXT ('g'|'ml')
- Per 100 g/ml: `calories`, `protein`, `carbs`, `fat`, `fiber`, `sugar`, `sat_fat`, `salt`, `micronutrients` JSONB
- `serving_size` NUMERIC (>0), `serving_label` TEXT, `package_size` NUMERIC
- `source` ('off'|'label_photo'|'admin'), `status` ('active'|'pending'|'hidden'), `created_by_client_id` FK→clients SET NULL, `verified_at`, `promoted_ingredient_id` FK→ingredients SET NULL
- Indexes: `lower(name)`, `(status)`, `(created_by_client_id, created_at DESC)`. RLS: admin ALL; customer SELECT when `current_client_id() IS NOT NULL AND (status='active' OR (status='pending' AND created_by_client_id = current_client_id()))`; no customer writes (inserts go through `/api/portal/foods/*` with the service client).
- `label_photo_path` / `front_photo_path` TEXT (nullable, `20261019000600_food_diary_shared_schema.sql`): storage keys in the private `food-label-photos` bucket for label-photo foods. Path convention `{client_id}/{food_id}/label.jpg` / `front.jpg` (food_id may be client-generated before the row exists); storage RLS: customer read/write only inside their own `client_id` folder, admin full access.

**`food_label_parses`** (label-photo parse log, for the FD-5 daily limit)
- `id` UUID PK, `client_id` FK→clients CASCADE, `model` TEXT, `outcome` ('ok'|'unreadable'|'error'), `created_at`
- Index `(client_id, created_at DESC)`. RLS: admin SELECT only; written server-side with the service client.

**`food_favorites`** (a customer's starred catalog items, FD-6)
- `id` UUID PK, `client_id` FK→clients CASCADE, exactly one of `food_id` / `ingredient_id` / `recipe_id` (FKs CASCADE; CHECK `num_nonnulls(...) = 1`), `created_at`
- Partial UNIQUE per target: `(client_id, food_id)`, `(client_id, ingredient_id)`, `(client_id, recipe_id)`. RLS: customer ALL on own rows; admin ALL (FD-12's food merge repoints favorites to the surviving food).

**`food_log_entries`** (customer food diary)
- `id` UUID PK (generated client-side so offline replays upsert idempotently), `client_id` FK→clients CASCADE, `log_date` DATE (customer LOCAL date), `meal_type` meal_type
- `source_kind` ('food'|'ingredient'|'recipe'|'quick'), `food_id` / `ingredient_id` / `recipe_id` FKs all SET NULL (history survives deletions); CHECK at most one FK, none for quick
- `quantity` NUMERIC >0, `quantity_unit` ('g'|'ml'|'serving'|'portion')
- Nutrition SNAPSHOT (totals for this entry, not per 100): `name`, `brand`, 8 nutrient columns, `micronutrients` JSONB — computed server-side at log time.
- Index `(client_id, log_date)`. RLS: customer ALL on own rows; admin SELECT.

**`meal_entry_status`** (customer eaten/skipped per plan entry)
- PK `meal_plan_entry_id`, `client_id`, `status` ('eaten'|'skipped'), `updated_at`
- `portion_factor` NUMERIC NULL, CHECK `> 0 AND <= 5` (`20261019000300_meal_status_portion_factor.sql`): share of the planned portion actually eaten ("Ate a different amount"); NULL = 1×. Only meaningful while `status='eaten'`; `/api/portal/status` stores NULL for any other status.

**`invoices`** (admin-only)
- `id` UUID PK, `store` TEXT, `invoice_date` DATE, `total` NUMERIC, `file_names` TEXT[], `parsed` JSONB (raw model output), `applied_lines` JSONB, `model` TEXT, `created_at`
- Index: `(store, invoice_date)`. Rows are written ONLY when the admin approves an import (via `apply_invoice_prices`).

**`ingredient_aliases`** (admin-only)
- `id` UUID PK, `ingredient_id` FK→ingredients CASCADE, `store` TEXT, `alias` TEXT (receipt/invoice name), `created_at`
- UNIQUE `(store, lower(alias))`; index `(ingredient_id)`. Remembers how a store prints an ingredient name.

### Functions
- `apply_invoice_prices(p_invoice jsonb, p_lines jsonb) RETURNS jsonb` — `SECURITY INVOKER`, admin-only (`is_admin()` else raises `forbidden`; EXECUTE revoked from PUBLIC, granted to `authenticated`). Validates each line (ingredient_id present, `package_price` and `quantity_purchased` non-NULL and > 0, else raises and rolls everything back). Atomically inserts the `invoices` row, and for each line: if `package_price` or `quantity_purchased` differs from the stored values it ALWAYS updates both (counted as `updated`), otherwise counts `unchanged`; the OLD values are logged to `ingredient_price_history` only when price-per-unit differs (exact comparison, so a pure package-size change writes no history). Upserts the `(store, raw_name)` alias. Returns `{invoice_id, updated, unchanged}`. Never writes the generated `price_per_unit`.
- Atomic UI write RPCs (`20261018000000_ux_integrity_rpcs.sql`, same house pattern: `SECURITY INVOKER`, `is_admin()` guard, EXECUTE revoked from PUBLIC / granted to `authenticated`; TS payload types in `lib/supabase/types.ts`):
  - `save_recipe(p_recipe_id uuid, p_recipe jsonb, p_ingredients jsonb) RETURNS uuid` — insert (id null) or update a recipe and replace its `recipe_ingredients` in one transaction. Missing `p_recipe` keys are written as NULL, so callers always send every key.
  - `duplicate_meal_plan(p_source_id, p_name, p_client_id, p_week_start, p_markup_multiplier) RETURNS uuid` — copies the plan's nutrition targets + all entry content (not statuses/reviews).
  - `clone_week(p_source_week date, p_target_week date) RETURNS jsonb` — duplicates every plan of a week; skips clients that already have a plan in the target week. Returns `{created: uuid[], skipped}`.
  - `log_container_delivery(p_client_id, p_meal_plan_id, p_delivery_date, p_notes, p_items jsonb) RETURNS uuid` — delivery + items in one insert; all-zero items skipped.
  - `regenerate_prep_tasks(p_week_start date, p_tasks jsonb) RETURNS jsonb` — replaces a week's prep tasks; new tasks inherit `completed`/`completed_at` from an old task with the same `(ingredient_id, prep_type, prep_date)`. Returns `{inserted, preserved_completed, dropped_completed}`.
- The same migration adds `meal_reviews` policy "Customer delete own" (`client_id = current_client_id()`; `meal_review_tags` cascade).

### RLS
Role-aware (since `20260609000001_rls_role_aware.sql`): admin tables use `is_admin()` for full CRUD; customer-readable tables additionally allow reads via `current_client_id()` (portal users). `profiles.role` ('admin' | 'customer') drives both helpers. New tables must follow this pattern.

**Customer-safe views (`20261019000010_hide_prices_from_customers.sql`):** customers have NO direct SELECT on `ingredients` or `recipes` (admin and customers share the `authenticated` role, so column grants cannot hide `package_price` / `price_per_unit` / `quantity_purchased` / `notes`). They read `ingredients_public` and `recipes_public` instead: owner (definer) views with `WHERE is_admin() OR current_client_id() IS NOT NULL`, granted to `authenticated` only. Never add price or notes columns to them. `recipe_ingredients` keeps its customer read policy. Portal code embeds `recipes_public` / `ingredients_public` (PostgREST resolves the embeds through the base-table FKs) and uses `PublicIngredient` / `PublicRecipe` / `PortalEntry` from `lib/supabase/types.ts`.

---

## Auth & Routing

- **Middleware** (`middleware.ts`): Checks Supabase auth on every request
- **Protected**: All routes under `app/(authenticated)/`
- **Public**: `/login`, `/intake`, `/api/og/*`, `/api/intake`
- **Flow**: No user → redirect `/login`; User on `/login` → redirect `/`
- **Session**: Cookie-based via @supabase/ssr

---

## API Routes

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/nutrition/search?q=` | GET | Yes | Search USDA + OFF, returns ranked results |
| `/api/nutrition/barcode?code=` | GET | Yes | Barcode (8-14 digits): `{ existing: {id,name} }` if already saved, else `{ product: BarcodeLookup }` from OFF v2, or 404 `{ error: "not_found" }` |
| `/api/invoices/parse` | POST | Admin | Stateless: multipart `files` (≤10, ≤4 MB, jpeg/png/webp/pdf) → Claude extraction + catalog matching; no writes |
| `/api/invoices/apply` | POST | Admin | JSON `{invoice, lines}` → `apply_invoice_prices` RPC (atomic), revalidates ingredients cache |
| `/api/export/meal-plan?id=` | GET | Yes | Generate + download meal plan PDF |
| `/api/export/meal-plan?id=` | POST | Yes | Generate PDF + email to client |
| `/api/intake` | POST | No | Public client onboarding form submission |
| `/api/portal/reviews` | POST / DELETE | Customer | Upsert a meal review (always send the intended `photo_path`) / delete own review (`?id=`; removes the photo from `meal-review-photos` first) |
| `/api/portal/status` | POST | Customer | Set meal status (eaten/skipped/null) + optional `portion_factor` (0–5, kept only for eaten). Body is one change, or `{changes: [...≤50]}` for a batch: ownership-checked as a whole (403 if any entry isn't theirs, nothing written), then one upsert + one delete. Client helpers `saveMealStatus()` / `saveMealStatuses()` queue offline per entry (the queue payload carries `portion_factor`) |
| `/api/portal/foods/search?q=&limit=` | GET | Customer | Price-free catalog search (q 2–100 chars, limit ≤ 25): active foods + own pending foods, ingredients, recipes from the client's plans (per-portion nutrition). Service client after `requireCustomer()`. Returns `{ results: CatalogItem[] }` |
| `/api/portal/foods/barcode?code=` | GET | Customer | Barcode (8–14 digits; UPC-A / EAN-13 / GTIN-14 spellings normalise to GTIN-13) → `{ item: CatalogItem, source: 'food'|'ingredient'|'off', created }`, `Cache-Control: no-store`. Order: `foods.barcode` (active or own pending; a promoted food resolves to its ingredient), `ingredients.barcode` (price-free columns, deterministic order), then Open Food Facts via `lookupBarcode()`. An OFF hit needs per-100 data with a known g/ml unit, kcal + P/C/F, sane values and kcal within 25%/40 kcal of 4P+4C+9F, else 404 `incomplete_data`; it is inserted as `foods` (active, source off, `created_by_client_id`), a unique conflict returns the existing row. 404 `not_found`, 429 `rate_limited` (30 new foods per rolling 24 h per customer, checked before the OFF call and again before the insert) or `too_many_lookups` (60 OFF calls/hour/customer, in-memory per instance), 502 `lookup_failed` (database error, or OFF down / rate limiting us: the UI offers Retry). All carry a friendly `message`. Stays a GET because the effect is idempotent. Logic in `lib/portal/foods.ts` |
| `/api/portal/diary` | POST / DELETE | Customer | POST upserts a `food_log_entries` row by client-generated `id` (snapshot computed server-side; catalog kinds may not send nutrition; quick add kcal 0–5000; `log_date` later than the customer's today + 1 day → 400, see `lib/portal/log-date.ts`) via the RLS client → `{ entry }`; DELETE `?id=` → `{ ok }` or 404. Both revalidate `CACHE_TAGS.foodLog`; client helpers `saveDiaryEntry()` / `deleteDiaryEntry()` queue offline |
| `/api/og/meal-plan?id=&format=` | GET | No | Generate OG image (legacy, story/landscape) |

---

## Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `app-shell.tsx` | Layout wrapper | Sidebar nav (6 items), mobile toggle, logout |
| `ingredient-form.tsx` | Create/edit ingredient | Nutrition search, price history tracking, macro inputs |
| `recipe-form.tsx` | Create/edit recipe | Ingredient picker, container type dropdown, live cost/nutrition |
| `nutrition-search.tsx` | Search nutrition APIs | Confidence badges, source labels, macro preview |
| `barcode-scanner.tsx` | Full-screen camera barcode scanner | `barcode-detector` (native or zxing-wasm ponyfill, wasm self-hosted at `/zxing/`), EAN-13/8, UPC-A/E, manual entry fallback, HTTPS required |
| `delivery-form.tsx` | Log container delivery | Expected returns from last delivery, send/return quantities |
| `weekly-shopping-modal.tsx` | Cross-plan shopping list | Week dropdown, aggregates entries across all plans with same week_start; renders `ShoppingListPanel` |
| `shopping-list-panel.tsx` | Shared shopping list body | Check-offs (`useShoppingChecks`), Copy / Print / Hide checked / Clear checks, totals; used by the weekly modal and the meal-plan grid |
| `weekly-cooking-modal.tsx` | Cross-plan cooking plan | Week dropdown, aggregates recipe portions + scaled ingredients across plans, per-client weight breakdown, persistent cooked check-offs |
| `portal/add-food-sheet.tsx` | Add-food sheet (portal) | `Modal variant="sheet"`, meal chips (default = tapped section), tabs `Search` / `Scan` / `Quick add` from a `TABS` list (`barcode-lookup.tsx` runs the scanner + lookup; a miss shows a disabled "Photograph the label" until FD-5); optimistic: saves via `useDiaryLog().save` and closes at once |
| `portal/food-search.tsx` | Catalog search + `FoodRow` | 250 ms debounce, `useListboxNav`, "Unverified" badge on own pending foods, "Search needs a connection" offline; `onPick(item)` so recents (FD-6) can reuse `FoodRow` |
| `portal/amount-picker.tsx` / `quick-add-form.tsx` / `edit-entry-sheet.tsx` | Amount + quick add + edit | g/ml, serving (if `servingSize`) or portion; decimal comma via `parseAmount`; live preview (`snapshotForCatalogItem`); edit = same-unit amount + meal (linear preview, server recomputes), quick entries edit name/macros, Delete → Undo toast |
| `ui/modal.tsx` | Shared dialog | `role="dialog"`, Escape, focus trap + restore, body scroll lock, `dirty` discard guard, `variant="sheet"` for portal bottom sheets; z-50 |
| `ui/confirm-dialog.tsx` | `useConfirm()` / `useAlert()` | Promise-based replacement for `window.confirm/alert`; z-[60] |
| `ui/toast.tsx` | `useToast()` | success/error/info with optional action (Undo/Retry), aria-live; z-[70] |
| `ui/icon-button.tsx` | Icon-only button | Required `label` (aria-label + title), ≥40px touch target on mobile |
| `ui/providers.tsx` | `UiProviders` | Toast + confirm providers, mounted once in the root `app/layout.tsx` |

---

## Library Code

### Supabase Clients
- `client.ts`: `createClient()` → browser client (used in client components)
- `server.ts`: `createServer()` → async server client with cookies (used in server components/API routes)

### Calculations
- `calculateRecipe(ingredients, portions)` → totalCost, costPerPortion, per-portion macros
- `calculateDay(entries)` → aggregated day nutrition + cost
- `calculateWeek(entries, markup)` → weekly totals, averageDaily, sellingPrice
- `resolveTargets(plan, client)` → resolved nutrition targets (calories absolute, macros = per-kg × (client goal weight ?? current weight)); also returns `weightBasis: {kg, source: "target"|"current"} | null` for UI labelling
- `lib/calculations/diary.ts` (pure): `nutritionForAmount(per100, grams)`, `resolveAmount`, `snapshotForCatalogItem`, `planEntryNutrition(entry)` (price-free, accepts any `NutritionSource`), `calculateDiaryDay({planEntries, statuses, logEntries})` → `{eaten, projected, byMeal, counts}`. Plan meals count only when 'eaten' (× optional `portion_factor`), skipped never; `projected` = eaten + pending plan meals at factor 1; logged entries always count. Also `sumTotals`, `scaleTotals`, `emptyTotals`.
- `lib/nutrition/nutrients.ts`: nutrient registry (`NUTRIENTS`, `MACRO_NUTRIENTS`, `MICRONUTRIENTS`, `getNutrient(key)`, `percentOfReference`) with EU Reg. 1169/2011 Annex XIII reference values (RI for energy/macros/sugar/sat fat/salt, NRV for the 14 micro keys; fiber has none). Unknown micro keys get a derived label.
- `lib/weight.ts`: `formatKg` ("72,5"), `formatWeightProgress(current, target)` ("95 → 80 kg"), `TARGET_WEIGHT_MIN/MAX` (30/300, mirrors the DB CHECK)

### Portal server helpers
- `lib/portal/require-customer.ts`: `requireCustomer()` route guard (401/403; returns the RLS client + `clientId`)
- `lib/portal/catalog.ts` (server only, takes the service client): `searchCatalog`, `loadCatalogItem`, `escapeLike`, `rankItems`; explicit column lists, never price columns or `recipes.notes`
- `lib/portal/write-queue-logic.ts`: pure queue key / de-dupe / request mapping behind `write-queue.ts`. Kinds: review, status, diary-upsert, diary-delete (diary kinds share key `diary:<id>`, so a later delete replaces a pending upsert)
- `lib/portal/today.ts`: `portalToday()` = the customer's local date for server pages (`tz` cookie → `todayInTz`, fallback Europe/Bucharest); use it instead of `new Date()` on every portal page. `lib/portal/log-date.ts`: `maxLogDate(tz)`. `lib/portal/format-amount.ts`: `formatEntryAmount`. `lib/portal/macro-colors.ts`: shared P/C/F colours.
- `lib/portal/foods.ts` (server only, takes the service client): `resolveBarcode(service, clientId, code, deps?)`, `normalizeBarcode()`, `mapOffToFood()` (OFF → `foods` row; rejects per-serving-only, unknown unit, missing kcal+P/C/F, impossible values, kcal vs macros mismatch), `energyMatchesMacros`, `findFood`, `canCreateFood`, `DAILY_NEW_FOOD_LIMIT`; `lib/portal/rate-limit.ts` `createRateLimiter`. FD-5 (label photo) and FD-12 (moderation) build on them. `BarcodeLookup` (OFF) also carries `serving` (from `serving_quantity` / `serving_size`) and `unit` (g|ml|null: package/serving unit, else liquid categories, never guessed). OFF `*_100g` micronutrients are GRAMS: `extractMicros` converts to the `_mg` (x1000) / `_ug` (x1e6) keys. `lookupBarcode` returns null only for a real 404 and throws `OffUnavailableError` otherwise
- `lib/portal/save-diary.ts`: `saveDiaryEntry(body)` / `deleteDiaryEntry(id)` → "saved" | "queued"
- `lib/portal/diary-draft.ts` (pure, tested): `newEntryId`, `availableUnits`/`defaultAmount`/`parseAmount`, `buildCatalogInput`/`buildQuickInput`, `optimisticEntry`, `entryToInput` (edit + Undo body), `scaleEntry`, `previewSnapshot`
- `lib/portal/diary-merge.ts` + `pending-diary.ts` + `use-diary-log.ts`: the day's entries = server rows + the customer's own unsynced changes (`mergeLogEntries`). Pending records live in localStorage (`portal:diary-pending:v1`, display only; the writes themselves are in the offline queue), are settled when the write lands / the queue flushes and dropped once fresh server data renders; `queuedDiaryIds()` in `write-queue.ts` tells which are still queued
- `generateShoppingList(entries)` → deduplicated ingredient list grouped by category
- `calculateClientBalance(client, deliveries, containerTypes)` → per-client outstanding containers, flag status
- `calculateExpectedReturns(lastDelivery)` → what client should return this delivery
- `calculateChargeableAmount(balance)` → lei amount for lost containers beyond tolerance

### Formatting (`lib/format.ts`)
- `formatLei` (ro-RO, grouped: "1.234,50 lei"), `formatNumber` (ro-RO decimal comma, no thousands grouping: "2200"), `formatQuantity` (<1 → one decimal, else integer), `formatPricePerUnit(ppu, unit)` (lei/kg, lei/l, lei/buc), `parseDecimal` (accepts "12,5" and "12.5")
- Labels: `humanizeSlug` ("bread_pasta" → "Bread Pasta", fallback when no category name), `WEEKDAYS_SHORT` / `WEEKDAYS_LONG` (Monday-first, index = `day_of_week - 1`)
- Dates in English en-GB: `formatDate`, `formatShortDate`, `formatDateTime`, `formatWeekRange` ("19–25 Oct 2026")
- Local-date helpers returning `'YYYY-MM-DD'`: `toLocalISODate`, `mondayOf`, `addDays`, `currentWeekStart`, `nextWeekStart`, `isMonday`, `parseLocalDate` — canonical here; `lib/portal/entry-helpers.ts` only re-exports aliases. Never use `toISOString()` / `new Date("YYYY-MM-DD")` for calendar dates (UTC off-by-one in Romania).

### Client helpers
- `lib/browser.ts`: `printHtml(html)` (hidden-iframe print), `escapeHtml`, `copyText(text) → Promise<boolean>`
- `lib/hooks/use-listbox-nav.ts`: `useListboxNav({ count, onSelect, onEscape?, enabled?, listRef? })` — ArrowUp/Down/Enter/Escape + `aria-activedescendant` ids for search pickers
- URL state in client components: `router.replace(url, { scroll: false })`, never `window.history.replaceState` (a later `router.refresh()` restores the router's own URL)

### Nutrition Search Pipeline
1. Parallel search: USDA + OFF (Romania-first, global English fallback if < 3 results)
2. USDA: filters cooked entries (unless query asks for cooked), assigns confidence by dataType
3. OFF: rejects if not per-100g or >2 missing core nutrients, computes 5-component NCS
4. NCS < 0.85 → hard reject from results
5. Ranking: confidence×45 + nameRelevance×35 + USDA bonus(10) - composite penalty(15)
6. Returns top 15

---

## Patterns

### Forms
- Modal dialogs (fixed overlay), client components
- Submit → Supabase mutation → `router.refresh()` → close modal
- Validation via Zod schemas

### Data Fetching
- **Server components**: Fetch in page.tsx via `createServer()`, pass as props
- **Client components**: `useEffect` or event handlers via `createClient()`

### Modals & feedback
- Use `components/ui/modal.tsx` (never a hand-rolled `fixed inset-0` div); pass `dirty` on forms with unsaved edits. Z-index scale: sidebar overlay z-40, modal z-50, confirm z-[60], toast z-[70].
- No `window.alert/confirm/prompt` (some embedded browsers suppress them): use `useConfirm()` and `useToast()`. Check every Supabase write's `error` and surface failures with a toast (Retry where cheap); optimistic updates roll back on failure.
- Multi-row writes that must succeed together go through an RPC (see Functions), not sequential client calls.
- Deep links: `?new=1` opens the create form on ingredients/recipes/clients, `?edit=<id>` on ingredients/recipes, `?scan=1` on ingredients; `/meal-plans?client=&week=&new=1`; cards are anchorable as `/clients#client-<id>` and `/containers#client-<id>`.

### Customer catalog reads
- Customers have no direct read on `ingredients` / `recipes`. Customer API routes call `requireCustomer()` FIRST, then read catalog data via `createServiceClient()` with explicit price-free column lists; writes to customer-owned tables use the customer's RLS client.

### Responsive
- Desktop: tables with expandable rows, sidebar always visible
- Mobile: card layouts (`md:hidden` / `hidden md:block`), hamburger sidebar

---

## Business Logic

### Pricing
- All prices in **lei** (Romanian currency)
- `price_per_unit` = package_price / quantity_purchased (DB-generated column)
- Recipe cost = sum(ingredient quantity × price_per_unit)
- Meal plan selling price = weekly ingredient cost × markup_multiplier (default 2.5)
- Price history: logged on update when price_per_unit changes (parallel with update via Promise.all)

### Nutrition
- Everything normalized **per 100g/100ml**
- Barcode lookup: `lookupBarcode(code)` in `lib/nutrition/open-food-facts.ts` (OFF v2 API) returns `{ result, packageSize, perServingOnly }`; no NCS hard-reject (user reviews the result). Scan from the ingredient form or the Scan button on the Ingredients page. Camera access requires HTTPS: test on a phone over LAN with `next dev --experimental-https`. The zxing `.wasm` is copied to `public/zxing/` by `npm install` (`postinstall` -> `scripts/copy-zxing-wasm.mjs`; gitignored).
- Recipe aggregation: `nutrient_total = sum(ingredient_nutrient × (quantity / 100))`
- Per portion = total / portions
- Micronutrients stored as flexible JSONB (vitamin_a_ug, iron_mg, etc.)

### Confidence Scoring (NCS)
```
NCS = completeness(0.3) + verification(0.2) + freshness(0.15) + consistency(0.2) + context(0.15)
```
- USDA: Foundation=1.0, SR Legacy=0.97, FNDDS=0.93, Branded=0.85
- OFF: computed via formula, must be ≥ 0.85 to appear

### Customer diary day (FD-2, `/portal`)
- Sections Breakfast / Lunch / Dinner / Snacks (`components/portal/diary-section.tsx`): plan `MealCard`s + that meal's `food_log_entries` (`diary-entry-list.tsx`, rows editable later via `onSelect`) + a per-section "+ Add" (`onAdd(mealType)`; today opens a stub sheet that FD-3 replaces). Future days show plan meals only, no Add and no eaten toggles; past/today allow logging. The diary works on days with no plan.
- Summary (`diary-summary.tsx`): kcal eaten / target / remaining, P/C/F bars, fiber aim range, and a "Planned" ghost on the kcal bar (projection = eaten + unmarked plan meals). Totals come from `calculateDiaryDay` (eaten = plan meals marked eaten × `portion_factor` + logged entries; skipped never counts); `planEntryNutrition` replaced the old 5-field `entryNutrition`.
- Targets: `resolveDayTargets(plans, client, date)` (`lib/portal/day-targets.ts`) = plan covering the date, else the latest earlier plan, else the client's `calorie_target` only; macros on `target_weight_kg ?? weight_kg`.
- Status writes go through `useMealStatus` (`lib/portal/use-meal-status.ts`): optimistic overlay, batch save (also used by "Mark remaining as eaten", with Undo), rollback + Retry toast, offline-queued. Saves are serialised per entry (a later tap waits for the earlier POST) and an override is dropped as soon as fresh server data arrives unless its save is in flight or queued offline. "Mark remaining as eaten" skips meals whose save is still in flight and sends ONE batch request. Used by Today and the plan detail page; `MealDetailSheet` takes `onChangeStatus` instead of saving itself. `PortionFactorSheet` = "Ate a different amount".
- Local date: the browser stores its IANA timezone in a `tz` cookie (set from `today-client.tsx`); the page computes today with `todayInTz(cookie)` (fallback `Europe/Bucharest`) and the client refreshes once if its own date differs. Logged rows for the day are read with the customer's RLS client; portal reads of ingredients/recipes use the `*_public` views.
- "Go to …" empty-day hint targets the nearest day that has plan MEALS (`mealDates`), not a plan-covered day.

### Container Tracking
- **Container types**: glass containers with name, volume, replacement cost
- **Recipe assignment**: each recipe optionally has a container_type_id
- **Delivery flow**: when delivering a meal plan, containers sent = recipe's container × portions per entry
- **Returns**: on next delivery, expected returns = containers sent in previous delivery
- **Balance**: outstanding = total sent − total returned (per client, per container type)
- **Tolerance**: each client has `container_tolerance` (default 2) — max outstanding before flagging
- **Flagging**: when total outstanding > tolerance → client is flagged (amber warning in dashboard)
- **Charging**: containers beyond tolerance can be charged at replacement cost from `container_types.cost`

### Invoice import
- Page `/ingredients/import`. Admin uploads Lidl Plus receipt screenshots / Freshful PDFs; tall images are sliced in the browser into ≤1560 px JPEG chunks (120 px overlap), total upload ≤4 MB.
- `POST /api/invoices/parse` is **stateless**: sends files + a compact ingredient/alias catalog to Claude (`lib/invoices/parse.ts`, structured output via zod), post-processes (`lib/invoices/postprocess.ts`: exact store alias overrides the model match with high confidence; unknown ids dropped; unit mismatch nulls the match) and returns lines with current vs new price-per-unit and % change plus a read-only `duplicateOf` check.
- **Approval checkpoint**: the parsed result lives only in client state; nothing is written until the admin reviews/edits lines and clicks Approve, which calls `/api/invoices/apply` → `apply_invoice_prices` (writes `invoices`, logs price history, updates prices, upserts `ingredient_aliases`).
- Env: `ANTHROPIC_API_KEY` (required), `INVOICE_PARSER_MODEL` (default `claude-haiku-5-5`; `claude-sonnet-5-5` also tested). Calls use the beta Messages endpoint with `output_config.effort: "medium"`; non-Haiku models also send the server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) — Haiku has none.
- Confirmations (Approve / Discard) use an in-page modal, not `window.confirm()`, which some embedded browsers suppress.

### PDF Export
- React PDF document (`@react-pdf/renderer`) generated server-side
- Content: meals by day with full nutrition per meal, daily totals, disclaimer
- **No pricing** shown to client
- Download as PDF or email via Resend (attachment)
- Disclaimer: "Except for protein, fiber, fat, and carbs, nutritional values may contain inaccuracies"

---

## Deployment

### Vercel
- Build: `next build`
- Framework: Next.js (auto-detected)

### Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anonymous key
SUPABASE_SERVICE_ROLE_KEY       # Service role key (for API routes)
USDA_API_KEY                    # USDA FoodData Central API key
RESEND_API_KEY                  # Resend email service (for PDF email delivery)
CONTAINER_TOLERANCE_DEFAULT     # Max outstanding containers before flagging (default: 2)
NEXT_PUBLIC_MEAL_PLAN_MARKUP_DEFAULT  # Default markup multiplier for new plans (default: 2.5)
ANTHROPIC_API_KEY               # Claude API key (invoice/receipt parsing); must be scoped to a workspace (keys without one are rejected with "must include the anthropic-workspace-id header")
INVOICE_PARSER_MODEL            # Optional; model for invoice parsing (default: claude-haiku-5-5)
```

### Local Development
- `.env.development.local` overrides `.env.local` during `next dev`
- Local Supabase via Docker: `npm run db:start`
- Scripts: `db:start`, `db:stop`, `db:reset`, `test` (vitest, `lib/**/*.test.ts`)
- `npm run build` reads `.env.local` (no Supabase keys locally), so a local production build fails at prerender; load the dev env first: `set -a; . ./.env.development.local; set +a; npm run build`

### Migrations
- Prod migration history was reconciled on 2026-10-17: `supabase db diff --linked` confirmed prod matched the 19 migrations up to `20260612000000` (only extra object: the Supabase-managed `rls_auto_enable()` event-trigger function), then `supabase migration repair --status applied` recorded them. **Never apply migrations through the SQL editor again**: use `npx supabase db push --linked` or the workflow, otherwise the history drifts again.
- `.github/workflows/migrate.yml` runs `db push` on every push to `main` that touches `supabase/migrations/**` (or manually via workflow_dispatch). It needs only `SUPABASE_ACCESS_TOKEN`, stored as an environment secret of the GitHub **Production** environment (the job declares `environment: Production` to read it): the pinned CLI (2.121.0) connects through a temporary login role, so no DB password secret is used.
- Test every migration locally first: Docker Desktop + `npm run db:start` + `npm run db:reset` (replays all migrations from scratch).

---

## Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Nutrition source priority | USDA first, OFF fallback | Raw ingredient accuracy |
| OFF geographic filter | Romania-first, global English fallback | Market-specific products |
| Cooked USDA entries | Filtered out unless query requests | Raw values more accurate for meal prep |
| NCS threshold | Hard reject < 0.85 | Prevent bad data in meal plans |
| Composite foods | Rank lower, not excluded | User may search "mici", "lentil chips" |
| Price history storage | Dedicated table | Queryable, supports trend analysis |
| Price history trigger | App-side on form submit | Simpler than DB trigger, compare price_per_unit |
| Price history display | Collapsible list in edit modal | Contextual, non-intrusive |
| Nutrition values | Rounded to 2 decimals in form | Prevents ugly floating-point display |
| Container tracking | Quantities by type, not individual | Simpler, sufficient for small operation |
| Container returns | Expected vs actual on next delivery | Free breakage/loss tracking |
| Container tolerance | Per-client threshold (default 2) | Friendly buffer before charging |
| PDF export | @react-pdf/renderer | React component model, server-side rendering |
| Email service | Resend | Simple API, free tier, Vercel-compatible |
| PDF content | No pricing, full nutrition + disclaimer | Client doesn't need to see costs |

---

## Changelog

| Date | Change | Files |
|------|--------|-------|
| 2025-05-11 | Mobile responsiveness for recipes + meal plan grid | `recipes-client.tsx`, `meal-plan-grid.tsx` |
| 2025-05-11 | Local Supabase setup (separate dev from prod) | `.env.development.local`, `package.json`, `.gitignore`, `supabase/config.toml` |
| 2025-05-11 | OG image route error handling (try-catch + diagnostics) | `app/api/og/meal-plan/route.tsx` |
| 2025-05-13 | Nutrition search overhaul: USDA-first, Romania OFF filter, NCS scoring, confidence badges | `lib/nutrition/*`, `lib/supabase/types.ts`, `components/nutrition-search.tsx` |
| 2025-05-13 | Nutrition values rounded to 2 decimals on form populate | `components/ingredient-form.tsx` |
| 2025-05-13 | Ingredient price history tracking | `supabase/migrations/20250513000000_price_history.sql`, `lib/supabase/types.ts`, `components/ingredient-form.tsx` |
| 2025-05-13 | Created CLAUDE.md project reference | `CLAUDE.md` |
| 2025-05-14 | Container types: table + CRUD page + recipe assignment | `supabase/migrations/20250514000000_container_types.sql`, `app/(authenticated)/containers/*`, `components/recipe-form.tsx`, `components/app-shell.tsx`, `lib/supabase/types.ts` |
| 2025-05-14 | Client email + phone fields | `supabase/migrations/20250514000001_client_contact.sql`, `app/(authenticated)/clients/clients-client.tsx`, `lib/supabase/types.ts` |
| 2025-05-14 | PDF meal plan export (download + email) | `app/api/export/meal-plan/route.ts`, `lib/pdf/meal-plan.tsx`, `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx` |
| 2025-05-14 | Container tracking: deliveries, returns, balances, tolerance/flagging | `supabase/migrations/20250514000002_container_tracking.sql`, `lib/calculations/containers.ts`, `components/delivery-form.tsx`, `app/(authenticated)/containers/*`, `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx` |
| 2025-05-14 | UX loading feedback on meal plan add/remove (spinners + disabled states) | `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx` |
| 2025-05-14 | Container flagging rewrite: delivery-pair comparison, first-delivery exempt | `lib/calculations/containers.ts` |
| 2025-05-14 | Policy values externalized to env vars (tolerance, markup) | `.env.local`, `lib/calculations/containers.ts`, `app/(authenticated)/meal-plans/meal-plans-client.tsx` |
| 2025-05-15 | Auto-fill ingredient name from nutrition search (when empty) | `components/ingredient-form.tsx` |
| 2025-05-15 | Fiber displayed in daily totals, weekly summary, and PDF | `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`, `lib/pdf/meal-plan.tsx` |
| 2025-05-15 | New ingredient categories: legumes, bread_pasta, dessert_sweets | `supabase/migrations/20250515000000_improvements.sql`, `lib/supabase/types.ts`, `components/ingredient-form.tsx`, `lib/calculations/shopping-list.ts` |
| 2025-05-15 | Shopping list check-off (session-only, excludes checked from copy) | `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx` |
| 2025-05-15 | Recipe final weight field (optional, shows g/portion) | `supabase/migrations/20250515000000_improvements.sql`, `lib/supabase/types.ts`, `components/recipe-form.tsx`, `app/(authenticated)/recipes/recipes-client.tsx` |
| 2025-05-15 | Clone recipe (copies recipe + all ingredients) | `app/(authenticated)/recipes/recipes-client.tsx` |
| 2025-05-15 | Ingredients tab in SlotPicker + fractional portions + direct ingredient entries | `supabase/migrations/20250515000000_improvements.sql`, `lib/supabase/types.ts`, `lib/calculations/meal-plan.ts`, `lib/calculations/shopping-list.ts`, `app/(authenticated)/meal-plans/[id]/page.tsx`, `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`, `app/api/export/meal-plan/route.ts` |
| 2025-05-15 | PDF export shows recipe ingredients (scaled to plan portions) | `lib/pdf/meal-plan.tsx`, `app/api/export/meal-plan/route.ts` |
| 2025-05-15 | Prep workflow: configurable rules + auto-generated weekly prep tasks from all meal plans | `supabase/migrations/20250516000000_prep_workflow.sql`, `lib/supabase/types.ts`, `lib/validations/schemas.ts`, `lib/calculations/prep.ts`, `components/prep-rule-form.tsx`, `app/(authenticated)/prep/*`, `components/app-shell.tsx` |
| 2025-05-15 | Dynamic categories: migrated ingredient_category ENUM to categories table, dynamic filter buttons, category management CRUD | `supabase/migrations/20250517000000_categories_table.sql`, `lib/supabase/types.ts`, `lib/validations/schemas.ts`, `lib/calculations/shopping-list.ts`, `components/ingredient-form.tsx`, `components/prep-rule-form.tsx`, `app/(authenticated)/ingredients/*`, `app/(authenticated)/prep/rules/*`, `app/(authenticated)/meal-plans/[id]/*` |
| 2025-05-15 | Removed recipe category (was meal_type enum) — recipes no longer classified by meal time | `supabase/migrations/20250518000000_drop_recipe_category.sql`, `lib/supabase/types.ts`, `lib/validations/schemas.ts`, `components/recipe-form.tsx`, `app/(authenticated)/recipes/recipes-client.tsx`, `app/(authenticated)/meal-plans/[id]/*` |
| 2025-05-15 | Drag-and-drop in meal plan grid: entries can be dragged between day/meal slots (@dnd-kit) | `package.json`, `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx` |
| 2026-05-29 | Per-meal-plan nutrition targets: client weight (kg) + per-kg macro ratios on plans, weekly-average comparison in summary | `supabase/migrations/20260529000000_nutrition_targets.sql`, `lib/supabase/types.ts`, `lib/validations/schemas.ts`, `lib/calculations/meal-plan.ts`, `app/(authenticated)/clients/clients-client.tsx`, `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`, `app/(authenticated)/meal-plans/[id]/page.tsx` |
| 2026-05-29 | Carbs target derived from calories − protein − fat (over-allocation hint); fiber target is a 10–14 g/1000 kcal range with in-range badge | `supabase/migrations/20260529000001_drop_derived_targets.sql`, `lib/supabase/types.ts`, `lib/validations/schemas.ts`, `lib/calculations/meal-plan.ts`, `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx` |
| 2026-05-29 | Weekly shopping list: aggregates ingredients across all meal plans sharing a week_start | `components/weekly-shopping-modal.tsx`, `app/(authenticated)/meal-plans/meal-plans-client.tsx` |
| 2026-06-02 | Persist shopping list check-offs in Supabase, keyed per week (shared across plans for the same week) | `supabase/migrations/20260602000000_shopping_check_state.sql`, `lib/supabase/types.ts`, `lib/hooks/use-shopping-checks.ts`, `components/weekly-shopping-modal.tsx`, `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx` |
| 2026-06-03 | Weekly Cooking Plan: cross-plan modal aggregating recipe portions + scaled ingredients across plans for a week, per-client weight breakdown, persistent cooked check-offs | `supabase/migrations/20260603000000_cooking_check_state.sql`, `lib/calculations/cooking-plan.ts`, `lib/hooks/use-cooking-checks.ts`, `lib/supabase/types.ts`, `components/weekly-cooking-modal.tsx`, `app/(authenticated)/meal-plans/meal-plans-client.tsx` |
| 2026-06-09 | Customer portal (PWA): profiles + role-aware RLS, customer-facing app at `/portal` (Today, Plans, Profile), per-meal status (eaten/skipped) + per-meal reviews (rating + comment + tag chips + photo via Supabase Storage), admin invite/revoke flow, admin reviews inbox + tag CRUD, recipe customer_description, review badges + status icons in meal-plan grid, recipe rating aggregates, manifest + service worker + offline write queue | `supabase/migrations/2026060900000{0..4}_*.sql`, `middleware.ts`, `app/login/page.tsx`, `app/(authenticated)/layout.tsx`, `app/(authenticated)/clients/*`, `app/(authenticated)/recipes/*`, `app/(authenticated)/reviews/*`, `app/(authenticated)/meal-plans/[id]/*`, `app/(portal)/*`, `app/api/portal/*`, `app/manifest.ts`, `public/sw.js`, `public/icons/*`, `components/app-shell.tsx`, `components/recipe-form.tsx`, `components/portal/*`, `components/admin/review-detail-modal.tsx`, `lib/portal/*`, `lib/supabase/types.ts`, `lib/validations/schemas.ts` |
| 2026-06-12 | Customer self-registration: /intake replaces anonymous form, captures email+password+phone+weight, matches existing clients by email, auto-confirms and signs in, requires password on re-register to prevent email-probing | `supabase/migrations/20260612000000_register_flow.sql`, `app/intake/page.tsx`, `app/api/intake/route.ts`, `app/login/page.tsx`, `lib/validations/schemas.ts`, `lib/supabase/types.ts` |
| 2026-06-12 | Server-side caching with `unstable_cache` + tag-based invalidation across admin reads (layout unread-reviews, ingredients/recipes/clients/meal-plans/containers/prep/reviews lists, meal-plan detail bundle); cached helpers run with a singleton service-role Supabase client (auth still gated at middleware/layout). Mutation forms call matching server-action `updateTag` invalidations before `router.refresh()`. Portal API routes use `revalidateTag(tag, "max")` so admin caches refresh after customer review/status writes. | `lib/data/*` (new layer), `lib/actions/revalidate.ts` (new), `app/(authenticated)/layout.tsx`, all 9 admin `page.tsx` files, `components/{ingredient,recipe,delivery,prep-rule}-form.tsx`, all `*-client.tsx` files under `app/(authenticated)/`, `app/api/portal/{reviews,status}/route.ts` |
| 2026-06-12 | Optimistic UI in meal-plan grid: drag/add/delete/copy mutations update local state immediately, fire Supabase write in background, revalidate cached detail bundle on success, roll back local state on failure. Adds use a temp UUID and reconcile to the real id when the insert returns. Eliminates per-mutation `router.refresh()` round-trips that were causing the "adding/moving items feels laggy" symptom. | `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx` |
| 2026-06-13 | Customer portal day scrubber: `/portal` accepts `?date=YYYY-MM-DD` and renders any past/future day via a sliding 7-day strip + month-grid calendar picker. Reviews and status writes work retroactively on past meals (no API change — both endpoints had no date guard). Future days hide the status segmented control and review composer; nutrition + ingredients still show. Desktop top nav added (existing `BottomTabs` is mobile-only). Portal pages remain per-request (no `unstable_cache`). | `lib/portal/entry-helpers.ts` (added `parseLocalDate`/`isValidLocalDate`/`compareLocalDate`), `lib/portal/plan-resolver.ts` (new), `components/portal/{top-nav,calendar-picker,day-scrubber}.tsx` (new), `components/portal/meal-detail-sheet.tsx` (added `isFuture` gate), `app/(portal)/layout.tsx`, `app/(portal)/portal/page.tsx`, `app/(portal)/portal/today-client.tsx`, `app/(portal)/portal/plans/[id]/{page,plan-detail-client}.tsx` |
| 2026-06-13 | Intake form no longer wipes admin-entered client fields: registration UPDATE now sends only fields the customer actually filled in (sparse `pickIntakeUpdates` helper); previously, blank optional fields sent `null` and clobbered admin-entered `weight_kg`/`calorie_target`/`restrictions`/`allergies`/`preferences`/`notes`. New-client INSERT path unchanged. | `app/api/intake/route.ts` |
| 2026-06-13 | Meal-plan inline quantity edit: click value text (`×3` / `200g`) on desktop or tap row on mobile to edit `portions`/`quantity` in place. Desktop renders an inline number input with ✓/✗ buttons (Enter/blur saves, Escape/✗ cancels via `onMouseDown` to beat blur). Mobile renders a centered popover with explicit Save/Cancel; ingredient entries expose both Quantity and Portions. Validation matches `SlotPicker` (portions ≥0.1 step 0.1; quantity ≥1 step 1). Saves via the existing optimistic snapshot/rollback pattern with same-id rapid-fire guard; new entries (`temp-` ids) and entries mid-drag are not editable. | `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx` |
| 2026-06-13 | Customer portal date-change feedback: tapping a date in the strip now snaps the selection instantly (`pendingDate` lifted into `today-client.tsx`), micro-pulses the tapped pill (CSS `@keyframes tap-pulse` + key-bump remount), and slides the strip ±3 days via `translateX` + double-RAF transition. Calendar picks show a `Loader2` spinner on the picked cell, dim the others, and auto-close when `selectedDate` catches up. Cards area shows three pulsing skeletons after a 100ms gate (fast cache hits don't flash). | `app/globals.css`, `app/(portal)/portal/today-client.tsx`, `components/portal/day-scrubber.tsx`, `components/portal/calendar-picker.tsx` |
| 2026-06-22 | Fix: portal API routes (`/api/portal/*`) were excluded from `isPortal` check in middleware, causing customer requests to be redirected to `/portal` (HTML) instead of processed — `fetch()` received HTML and threw JSON parse error. Extended `isPortal` to cover `/api/portal` prefix. | `middleware.ts` |
| 2026-10-17 | Foundation for barcode scan + invoice price import: `ingredients.brand`, `invoices` + `ingredient_aliases` tables (admin RLS), atomic `apply_invoice_prices()` RPC, shared types, `requireAdmin()` API guard (invite route refactored), IngredientForm `brand` field + `defaults`/`onSaved` props, brand shown in ingredients list, hardened (still disabled) migrate workflow | `supabase/migrations/20261017000000_ingredient_brand.sql`, `supabase/migrations/20261017000001_invoice_import.sql`, `lib/supabase/types.ts`, `lib/validations/schemas.ts`, `lib/auth/require-admin.ts`, `app/api/portal/invite/route.ts`, `components/ingredient-form.tsx`, `app/(authenticated)/ingredients/ingredients-client.tsx`, `.github/workflows/migrate.yml`, `CLAUDE.md` |
| 2026-10-17 | Receipt/invoice price import: Claude-based parsing (stateless), review/approval UI with ingredient matching + create-ingredient, atomic apply, store aliases | `lib/invoices/parse.ts`, `lib/invoices/postprocess.ts`, `app/api/invoices/parse/route.ts`, `app/api/invoices/apply/route.ts`, `app/(authenticated)/ingredients/import/*`, `app/(authenticated)/ingredients/ingredients-client.tsx`, `.gitignore`, `package.json`, `CLAUDE.md` |
| 2026-10-17 | Barcode scanning for ingredients: `barcode-detector` scanner overlay, `/api/nutrition/barcode`, OFF client refactor (`mapProduct`, `lookupBarcode` on v2 API with package size parsing), Scan buttons in ingredient form + Ingredients page, self-hosted zxing wasm via postinstall | `components/barcode-scanner.tsx`, `components/ingredient-form.tsx`, `app/api/nutrition/barcode/route.ts`, `lib/nutrition/open-food-facts.ts`, `app/(authenticated)/ingredients/ingredients-client.tsx`, `scripts/copy-zxing-wasm.mjs`, `package.json`, `.gitignore` |
| 2026-10-17 | Reconciled prod migration history: the migrate workflow had never succeeded and migrations were pasted into the SQL editor, so `schema_migrations` was empty. Verified prod schema = the 19 migration files (`db diff --linked`, public + storage), then `migration repair --status applied` for all 19. Only the two 2026-10-17 migrations are now pending. | `CLAUDE.md` |
| 2026-10-17 | Invoice parse errors now include the Claude API's own message (and log it server-side) instead of a generic "files may be unreadable" — a user-scoped API key was being rejected for missing a workspace and the UI hid the reason | `lib/invoices/parse.ts`, `CLAUDE.md` |
| 2026-10-17 | Invoice import: Discard/Approve confirmations moved from `window.confirm()` (silently returned false in the app's embedded browser, so both buttons did nothing) to an in-page modal; parser now sets `effort: "medium"` explicitly and enables the server-side refusal fallback for non-Haiku models (Sonnet test runs) | `app/(authenticated)/ingredients/import/import-client.tsx`, `lib/invoices/parse.ts`, `CLAUDE.md` |
| 2026-10-17 | Invoice prompt: Freshful invoices list NET unit prices + VAT rate, sizes only in product names, "Discount" lines under the item they reduce, per-page subtotals and service/fee lines. Haiku was returning pre-VAT prices and empty package sizes; prompt now spells out net→gross (× (1 + VAT)), discount-before-VAT, size-from-name, final total vs page subtotal and fee lines as non-food. Verified on a real 44-line Freshful invoice: Haiku and Sonnet both 31/31 correct prices and package sizes. | `lib/invoices/parse.ts`, `CLAUDE.md` |
| 2026-10-17 | PR #3 review fixes: `apply_invoice_prices` now updates on any price/package change (history only when price-per-unit differs; validates inputs; EXECUTE revoked from PUBLIC) instead of the 0.0001 lei threshold; ingredient-form price-history check uses exact per-unit change; Claude parse: truncated-output and timeout errors mapped (SDK timeout 100s, 1 retry), invalid calendar dates nulled/rejected (`lib/invoices/dates.ts`); review UI: editable store/date, price rounded to 2 decimals, unit-mismatch and duplicate-ingredient warnings, 10-part limit; barcode: no digits-as-name, self-match ignored, per-serving warning only with nutrition; migrate workflow limited to main + concurrency group | `supabase/migrations/20261017000001_invoice_import.sql`, `lib/invoices/{parse,postprocess,dates}.ts`, `app/api/invoices/apply/route.ts`, `app/(authenticated)/ingredients/import/import-client.tsx`, `components/ingredient-form.tsx`, `lib/nutrition/open-food-facts.ts`, `.github/workflows/migrate.yml`, `CLAUDE.md` |
| 2026-10-17 | UX review notes: three parallel read-only passes (admin catalog/shell, admin planning/ops, customer portal/intake) with severity-ranked findings, cross-cutting themes and an implementation order | `docs/ux-review-2026-10-17.md`, `CLAUDE.md` |
| 2026-10-17 | UX foundations: shared `Modal` / `useConfirm` / `useAlert` / `useToast` / `IconButton` (providers in root layout), `lib/format.ts` (ro-RO lei, en-GB dates, local-date-safe week helpers), global `prefers-reduced-motion` rule; atomic RPCs `save_recipe`, `duplicate_meal_plan`, `clone_week`, `log_container_delivery`, `regenerate_prep_tasks` + customer delete policy on `meal_reviews` (tested on local Docker DB; **not yet pushed** — lands via the migrate workflow on merge to main) | `components/ui/*`, `lib/format.ts`, `app/layout.tsx`, `app/globals.css`, `supabase/migrations/20261018000000_ux_integrity_rpcs.sql`, `lib/supabase/types.ts`, `CLAUDE.md` |
| 2026-10-17 | UX review fixes (all screens, per `docs/ux-review-2026-10-17.md`): every alert/confirm → toast/confirm dialog, every modal → shared Modal, write errors surfaced with rollback; recipe save / plan duplicate / delivery / prep regenerate now atomic (prep keeps completed checks); meal plans grouped by week with client filter + "New week from last week"; grid undo-delete toast, SlotPicker multi-add, mobile Move-to, keyboard drag, per-day kcal-vs-target badges, sibling-week nav; ingredients/recipes search + sort + deep links, decimal-comma inputs with lei/kg preview, FK-aware delete messages; receipt import bulk actions, changed-items summary, in-app nav guard; categories move-then-delete (also repoints prep rules); prep week arrows + Monday snap; clients cross-links + allergy chips; container balances first, Mark all returned; reviews links to recipe/plan/client, mark unread/all read; actionable dashboard (needs attention, this week, quick actions); a11y sweep (labels, focus, targets, aria-current). Portal: one-tap Eaten, status rollback, offline queue on any network failure + sync chip, review delete + photo failure handling (also fixed resubmit wiping the photo), first-run state, progress header, loading/error pages, Jump to today, install/offline banners, profile sign out + change password, intake sections + inline validation + server-side ranges, `password_set` set for returning registrants. Skipped (product decisions): Romanian UI copy, kg/l units, archive-instead-of-delete, customer self-edit of allergies, bigger-ideas list | `app/(authenticated)/**`, `app/(portal)/**`, `app/intake/*`, `app/login/page.tsx`, `app/api/intake/route.ts`, `app/api/portal/reviews/route.ts`, `app/portal/set-password/*`, `app/manifest.ts`, `public/sw.js`, `components/*.tsx`, `components/portal/*`, `components/admin/review-detail-modal.tsx`, `lib/data/{dashboard,meal-plan-siblings,meal-plans,reviews,tags}.ts`, `lib/actions/revalidate.ts`, `lib/hooks/use-{shopping,cooking}-checks.ts`, `lib/portal/*`, `lib/validations/schemas.ts`, `CLAUDE.md` |
| 2026-10-17 | Simplify pass over the UX diff: canonical local-date + label helpers in `lib/format.ts` (`humanizeSlug`, `WEEKDAYS_*`, `formatQuantity`; entry-helpers re-exports, no more format→calculations import chain); `formatNumber` no longer groups thousands ("2200 kcal", not "2.200"); shared `ShoppingListPanel` replaces the grid's duplicate shopping modal; `lib/browser.ts` print/clipboard helpers; `useListboxNav` hook for pickers; URL state via `router.replace` (fixes `?new=1` reappearing after save; ingredients search write debounced 300 ms); review tags fetched once per page; stable `DndContext` id (hydration warning) | `lib/format.ts`, `lib/portal/entry-helpers.ts`, `lib/browser.ts`, `lib/hooks/use-listbox-nav.ts`, `lib/calculations/shopping-list.ts`, `components/shopping-list-panel.tsx`, `components/weekly-{shopping,cooking}-modal.tsx`, `components/{ingredient,recipe,prep-rule}-form.tsx`, `components/portal/{meal-detail-sheet,review-composer}.tsx`, `app/(authenticated)/{ingredients,recipes,clients,reviews,prep}/*-client.tsx`, `app/(authenticated)/ingredients/import/import-client.tsx`, `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`, `app/(portal)/portal/plans/[id]/plan-detail-client.tsx`, `CLAUDE.md` |
| 2026-10-18 | PR #4 code-review fixes: removing a meal that has a customer review or eaten/skipped status now asks first and offers no Undo (those rows cascade-delete); offline write queue items get stable ids so a flush only removes what it sent (no lost/stale edits when a write is superseded mid-flush), and `dropQueued()` clears older queued writes after a successful direct status/review save or review delete; shared `Modal` handles Escape in the bubble phase and ignores events an inner control already handled (`preventDefault`), so Escape in a dropdown inside a modal closes only the dropdown (`useListboxNav` marks handled Escape) | `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`, `lib/portal/{write-queue,save-status}.ts`, `components/portal/review-composer.tsx`, `components/ui/modal.tsx`, `lib/hooks/use-listbox-nav.ts`, `CLAUDE.md` |
| 2026-10-18 | Grid remove-confirm no longer trusts cached data: before removing an entry it queries `meal_entry_status` and `meal_reviews` directly (the cached detail bundle can be one view stale after a customer acts, because the portal routes revalidate with stale-while-revalidate), treats a failed check as "has customer data", and ignores duplicate removes while the check runs. Browser-verified with a status written behind the cache. | `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`, `CLAUDE.md` |
| 2026-10-18 | PR #4 follow-ups: plans list now expired by grid mutations (`invalidateMealPlan` also expires `mealPlans`); check-offs use upsert/ignoreDuplicates and Retry is a no-op once the week changed; grid rollbacks restore only the affected entry (no whole-list snapshot) and X on an unsaved `temp-` row is blocked; category move drops prep rules identical to the target's before repointing; `currentWeekStart()` now uses `Europe/Bucharest` (`todayInAppTz`) so SSR matches the browser; `prep.ts` uses local date helpers; review API rejects `photo_path` outside `<client_id>/` and deletes replaced/cleared photos; grid table min width (scrolls at ~1024px); duplicate/clone_week rename the embedded week range (`retitleForWeek`, SQL `format_week_range`); portal day dots / "Go to" only count days that have meals; Today header refreshes after the offline queue flushes; Modal focuses immediately on open (works for `?new=1`); /containers lists every client; clone-week toast omits "skipped 0"; a11y: labelled New plan / clone-week inputs, descriptive "Mark … as eaten" names, tag chips `aria-pressed`, Profile copy | `lib/actions/revalidate.ts`, `lib/hooks/use-{shopping,cooking}-checks.ts`, `app/(authenticated)/meal-plans/**`, `app/(authenticated)/ingredients/categories/categories-client.tsx`, `app/(authenticated)/containers/*`, `lib/format.ts`, `lib/calculations/prep.ts`, `app/api/portal/reviews/route.ts`, `app/(portal)/portal/*`, `components/portal/{meal-card,tag-chips}.tsx`, `components/ui/modal.tsx`, `supabase/migrations/20261019000000_clone_week_rename.sql` |
| 2026-10-18 | Food Diary epic spec (MyFitnessPal-style tracking in the portal): agreed product decisions (shared `foods` catalog fed only by barcode scans / Claude-read label photos, label foods private until admin verifies, quick add, plan meals count only when marked eaten, macro targets on a new target weight, weight log history), current-state findings (customers can read ingredient prices / recipe notes via RLS, no serving sizes, server-UTC default date) and 13 stories FD-0…FD-12 with acceptance criteria, dependencies, order and a tracker table | `docs/superpowers/specs/2026-10-18-food-diary-epic.md`, `CLAUDE.md` |
| 2026-10-18 | FD-0: customers can no longer read ingredient prices or recipe notes. Dropped the customer SELECT policies on `ingredients` / `recipes`; added `ingredients_public` / `recipes_public` definer views (admin or linked customer only, never anon); portal queries embed the views; `PublicIngredient` / `PublicRecipe` / `PortalEntry` types; portal `entryNutrition` no longer goes through `calculateRecipe` (no cost) | `supabase/migrations/20261019000010_hide_prices_from_customers.sql`, `lib/supabase/types.ts`, `lib/portal/entry-helpers.ts`, `app/(portal)/portal/{page,today-client}.tsx`, `app/(portal)/portal/plans/[id]/{page,plan-detail-client}.tsx`, `components/portal/meal-detail-sheet.tsx`, `CLAUDE.md` |
| 2026-10-18 | FD-1: food diary foundation. Shared `foods` catalog + `food_log_entries` diary tables with RLS; nutrient registry with EU reference values; pure diary calculations (eaten-only plan semantics, projection); customer catalog search and diary upsert/delete API (server-side snapshot, `requireCustomer()` guard); offline queue diary kinds (logic extracted to `write-queue-logic.ts`) + `save-diary` helper; vitest 3 with 37 tests. No UI yet (FD-2/FD-3) | `supabase/migrations/20261019000100_food_diary_foundation.sql`, `lib/supabase/types.ts`, `lib/validations/schemas.ts`, `lib/nutrition/nutrients.ts`, `lib/calculations/diary.ts`, `lib/portal/{catalog,require-customer,write-queue,write-queue-logic,save-diary}.ts`, `lib/data/tags.ts`, `app/api/portal/{foods/search,diary}/route.ts`, `vitest.config.ts`, `package.json`, `CLAUDE.md` |
| 2026-10-18 | FD-7: client goal weight. `clients.target_weight_kg` (30–300); `resolveTargets` computes protein/fat on the goal weight (fallback current) and returns `weightBasis`; "Goal weight (kg)" in the admin client form (decimal comma) + "95 → 80 kg" on the card, "Macros on N kg goal/current weight" in the grid summary, optional intake field (sparse-update safe), read-only on the portal profile; `resolveTargets` unit tests | `supabase/migrations/20261019000200_client_target_weight.sql`, `lib/weight.ts`, `lib/supabase/types.ts`, `lib/calculations/{meal-plan,meal-plan.test}.ts`, `lib/validations/schemas.ts`, `app/(authenticated)/clients/clients-client.tsx`, `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`, `app/intake/page.tsx`, `app/api/intake/route.ts`, `app/(portal)/portal/profile/page.tsx`, `CLAUDE.md` |
| 2026-10-18 | Food diary step 1 integration (FD-0 + FD-1 + FD-7 built by parallel agents, merged on `food-diary/step-1`): `foods` customer policy also requires `current_client_id() IS NOT NULL`; migrations applied to the local DB with `supabase migration up` (no reset) and RLS checked with customer/admin/anon JWTs; portal Today renders through the views; diary API checked in the browser (search, snapshot math, quick add, spoofed-nutrition 400, delete/404); profile goal weight checked. Not yet pushed | `supabase/migrations/20261019000100_food_diary_foundation.sql`, `app/(portal)/portal/{today-client,plans/[id]/plan-detail-client}.tsx`, `components/portal/meal-detail-sheet.tsx`, `docs/superpowers/specs/2026-10-18-food-diary-epic.md`, `CLAUDE.md` |
| 2026-10-18 | FD-2: customer diary day view. Today page reworked into Breakfast/Lunch/Dinner/Snacks sections (plan cards + logged entries + "+ Add" stub), summary header with kcal/macros/fiber vs `resolveDayTargets` and a Planned ghost; `meal_entry_status.portion_factor` + "Ate a different amount" + "Mark remaining as eaten" (with Undo); status API/`saveMealStatus`/offline queue carry the factor; `useMealStatus` hook shared with the plan detail page; `entryNutrition` removed in favour of `planEntryNutrition`; default date is the customer's local date via a `tz` cookie (`todayInTz`). Fixed a migration version collision from merging step 1 into main (both had `20261019000000`): `hide_prices_from_customers` is now `20261019000010` (local DB history updated by hand, no reset). Browser-checked at 375×812 and desktop: mixed day (eaten + 0.5× + skipped + quick add) matched hand math (813 kcal eaten / 923 planned), offline queue + flush | `supabase/migrations/20261019000300_meal_status_portion_factor.sql`, `supabase/migrations/20261019000010_hide_prices_from_customers.sql`, `lib/portal/{day-targets,use-meal-status,save-status,write-queue,entry-helpers}.ts`, `lib/format.ts`, `lib/validations/schemas.ts`, `lib/supabase/types.ts`, `app/api/portal/status/route.ts`, `app/(portal)/portal/{page,today-client}.tsx`, `app/(portal)/portal/plans/[id]/plan-detail-client.tsx`, `components/portal/{diary-summary,diary-section,diary-entry-list,portion-factor-sheet,meal-card,meal-detail-sheet}.tsx`, `CLAUDE.md` |
| 2026-10-19 | PR #6 review fixes: catalog recipe membership no longer reads all of a client's plan entries (recipes matched by name first, then checked with a paginated `meal_plan_entries` query; `loadCatalogItem` checks one id; `collectPages` helper + test) so clients with >1000 entries keep older recipes; diary API rejects `log_date` later than today+1 (`maxLogDate`); `portalToday()` shared by Today, Plans and plan detail (no more server-UTC today); diary amounts show up to 2 decimals and pluralise on the shown value (`formatEntryAmount`, `formatDecimal`); status writes serialised per entry, overrides dropped once server data lands, "Mark remaining" skips in-flight meals and posts one batch (`/api/portal/status` accepts `{changes}`); summary shows "no carb budget" instead of "/0 g"; macro colours shared (`MACRO_BG`) between summary and meal sheet; `todayInAppTz` reuses `todayInTz`. Browser-checked: single batch POST, future log_date 400, batch with a foreign id 403 with nothing written, plan detail toggle | `lib/portal/{catalog,today,log-date,format-amount,macro-colors,save-status,use-meal-status}.ts`, `lib/format.ts`, `lib/validations/schemas.ts`, `app/api/portal/{status,diary}/route.ts`, `app/(portal)/portal/{page,plans/page,plans/[id]/page,today-client}.tsx`, `components/portal/{diary-summary,diary-entry-list,meal-detail-sheet,portion-factor-sheet}.tsx`, `CLAUDE.md` |
| 2026-10-19 | FD-3: log food from the catalog + quick add. Add-food sheet (search with keyboard nav, amount picker with live preview, quick add), edit/delete with Undo from the diary rows, optimistic writes through `saveDiaryEntry`/`deleteDiaryEntry`, offline entries stay visible with "Waiting to sync" until the queue flushes (no duplicates: client-generated ids). No migration. Browser-verified at 375×812 and desktop as the QA customer, including a simulated offline add | `components/portal/{add-food-sheet,food-search,amount-picker,quick-add-form,edit-entry-sheet,meal-type-chips,macro-preview,diary-entry-list}.tsx`, `lib/portal/{diary-draft,diary-merge,pending-diary,use-diary-log,write-queue}.ts`, `app/(portal)/portal/today-client.tsx`, `docs/superpowers/specs/2026-10-18-food-diary-epic.md`, `CLAUDE.md` |
| 2026-10-19 | FD-4: barcode scan to log. `GET /api/portal/foods/barcode` (foods → ingredients → Open Food Facts; new OFF products inserted once into the shared `foods` catalog, 30/day/customer limit, friendly 404/429 reasons), reusable `lib/portal/foods.ts`, OFF serving size/quantity mapped to `foods.serving_*` + g/ml unit, Scan tab in the add-food sheet (manual entry works without a camera), scanner torch button now appears when the camera supports it, index on `ingredients.barcode`. Unit tests for mapping/validation; browser-checked on desktop with manual entry (no phone scan over HTTPS yet) | `supabase/migrations/20261019000400_ingredients_barcode_index.sql`, `lib/portal/{foods,foods.test,catalog}.ts`, `lib/nutrition/open-food-facts.ts`, `app/api/portal/foods/barcode/route.ts`, `components/portal/{barcode-lookup,add-food-sheet}.tsx`, `components/barcode-scanner.tsx`, `docs/superpowers/specs/2026-10-18-food-diary-epic.md`, `CLAUDE.md` |
| 2026-10-19 | FD-4 review fixes: OFF micronutrients were stored in grams under `_mg`/`_ug` keys (1000x / 1e6x too small): importer now converts (USDA mapping checked, native units already correct); data-repair migration (own commit) backs up then converts `api_source = 'openfoodfacts'` ingredient micros: **review before merge, the migrate workflow applies it to prod**; OFF 429/5xx no longer reads as not-found (502 + Retry); GTIN normalisation (UPC-A/EAN-13/GTIN-14); per-customer OFF lookup cap + daily cap checked before the fetch and before the insert (residual count-then-insert race documented); unit never guessed (liquid categories → ml, else incomplete); kcal-vs-macros check; ro/en/generic name fallback; deterministic ingredient order; no-store GET; client abort/timeout/stale-response guard; resolveBarcode + quota + normalisation tests | `lib/nutrition/open-food-facts{,.test}.ts`, `lib/portal/{foods,foods-resolve.test,rate-limit}.ts`, `app/api/portal/foods/barcode/route.ts`, `components/portal/barcode-lookup.tsx`, `supabase/migrations/20261019000500_fix_off_micronutrient_units.sql`, `CLAUDE.md` |
| 2026-10-19 | Food diary step 3 shared schema (base for FD-5, FD-6 and FD-12, built in parallel): `foods.label_photo_path` / `front_photo_path`, private `food-label-photos` bucket with own-folder customer policies, `food_label_parses` (label-parse log for the daily limit, admin-read only), `food_favorites` (one target per row, partial unique per client+target, customer manages own). Dry-run RLS checks with customer/admin/anon JWTs; applied locally | `supabase/migrations/20261019000600_food_diary_shared_schema.sql`, `lib/supabase/types.ts`, `CLAUDE.md` |
