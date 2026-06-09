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

---

## Project Structure

```
app/
├── (authenticated)/        # Protected routes (requires login)
│   ├── layout.tsx          # AppShell wrapper (sidebar + nav)
│   ├── page.tsx            # Dashboard
│   ├── ingredients/        # Ingredients CRUD
│   │   └── categories/     # Category management CRUD
│   ├── recipes/            # Recipes CRUD
│   ├── meal-plans/         # Meal plans list + [id] grid editor
│   ├── prep/               # Prep schedule (weekly view + rules config)
│   ├── clients/            # Clients CRUD
│   └── containers/         # Container types CRUD + client balances
├── api/
│   ├── nutrition/search/   # Nutrition API search (USDA + OFF)
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
│   └── prep.ts             # generatePrepTasks() → weekly prep task generation from meal plans
├── nutrition/
│   ├── index.ts            # searchNutrition() orchestrator
│   ├── usda.ts             # USDA FoodData Central API
│   ├── open-food-facts.ts  # Open Food Facts API (Romania-first)
│   ├── confidence.ts       # NCS formula (5 components)
│   └── classification.ts   # Ingredient classification + cooked keywords
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
- `id` UUID PK, `name` TEXT, `category` TEXT (references ingredient_categories.slug by convention)
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
- `calorie_target` INT, `weight_kg` NUMERIC, `restrictions` TEXT, `allergies` TEXT, `preferences` TEXT, `notes` TEXT
- `container_tolerance` INT (default 2) — max containers a client can have outstanding before being flagged

**`meal_plans`**
- `id` UUID PK, `name` TEXT, `client_id` FK→clients SET NULL, `week_start` DATE, `markup_multiplier` NUMERIC (default 2.5)
- `calorie_target` INT (kcal/day), `protein_per_kg` NUMERIC, `fat_per_kg` NUMERIC — per-plan nutrition targets; macros multiply by `clients.weight_kg`. Carbs and fiber targets are derived (carbs from calories−protein−fat; fiber as 10–14 g/1000 kcal range).

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

### RLS
All tables: `auth.uid() IS NOT NULL` → full CRUD access (single-admin model)

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
| `/api/export/meal-plan?id=` | GET | Yes | Generate + download meal plan PDF |
| `/api/export/meal-plan?id=` | POST | Yes | Generate PDF + email to client |
| `/api/intake` | POST | No | Public client onboarding form submission |
| `/api/og/meal-plan?id=&format=` | GET | No | Generate OG image (legacy, story/landscape) |

---

## Components

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `app-shell.tsx` | Layout wrapper | Sidebar nav (6 items), mobile toggle, logout |
| `ingredient-form.tsx` | Create/edit ingredient | Nutrition search, price history tracking, macro inputs |
| `recipe-form.tsx` | Create/edit recipe | Ingredient picker, container type dropdown, live cost/nutrition |
| `nutrition-search.tsx` | Search nutrition APIs | Confidence badges, source labels, macro preview |
| `delivery-form.tsx` | Log container delivery | Expected returns from last delivery, send/return quantities |
| `weekly-shopping-modal.tsx` | Cross-plan shopping list | Week dropdown, aggregates entries across all plans with same week_start |
| `weekly-cooking-modal.tsx` | Cross-plan cooking plan | Week dropdown, aggregates recipe portions + scaled ingredients across plans, per-client weight breakdown, persistent cooked check-offs |

---

## Library Code

### Supabase Clients
- `client.ts`: `createClient()` → browser client (used in client components)
- `server.ts`: `createServer()` → async server client with cookies (used in server components/API routes)

### Calculations
- `calculateRecipe(ingredients, portions)` → totalCost, costPerPortion, per-portion macros
- `calculateDay(entries)` → aggregated day nutrition + cost
- `calculateWeek(entries, markup)` → weekly totals, averageDaily, sellingPrice
- `resolveTargets(plan, client)` → resolved nutrition targets (calories absolute, macros = per-kg × client weight)
- `generateShoppingList(entries)` → deduplicated ingredient list grouped by category
- `calculateClientBalance(client, deliveries, containerTypes)` → per-client outstanding containers, flag status
- `calculateExpectedReturns(lastDelivery)` → what client should return this delivery
- `calculateChargeableAmount(balance)` → lei amount for lost containers beyond tolerance

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

### Modals
- State-controlled rendering, z-index layered (z-40 form, z-50 search)
- Close via X button or overlay click

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
- Recipe aggregation: `nutrient_total = sum(ingredient_nutrient × (quantity / 100))`
- Per portion = total / portions
- Micronutrients stored as flexible JSONB (vitamin_a_ug, iron_mg, etc.)

### Confidence Scoring (NCS)
```
NCS = completeness(0.3) + verification(0.2) + freshness(0.15) + consistency(0.2) + context(0.15)
```
- USDA: Foundation=1.0, SR Legacy=0.97, FNDDS=0.93, Branded=0.85
- OFF: computed via formula, must be ≥ 0.85 to appear

### Container Tracking
- **Container types**: glass containers with name, volume, replacement cost
- **Recipe assignment**: each recipe optionally has a container_type_id
- **Delivery flow**: when delivering a meal plan, containers sent = recipe's container × portions per entry
- **Returns**: on next delivery, expected returns = containers sent in previous delivery
- **Balance**: outstanding = total sent − total returned (per client, per container type)
- **Tolerance**: each client has `container_tolerance` (default 2) — max outstanding before flagging
- **Flagging**: when total outstanding > tolerance → client is flagged (amber warning in dashboard)
- **Charging**: containers beyond tolerance can be charged at replacement cost from `container_types.cost`

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
```

### Local Development
- `.env.development.local` overrides `.env.local` during `next dev`
- Local Supabase via Docker: `npm run db:start`
- Scripts: `db:start`, `db:stop`, `db:reset`

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
