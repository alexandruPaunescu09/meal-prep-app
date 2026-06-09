# Customer-Facing Portal — Design Spec

## Context

The meal-prep-app is currently admin-only: a single admin manages clients, recipes, meal plans, prep, and container tracking. Clients are data records — they receive their plans via emailed PDF and have no direct interaction with the system.

We need to add a customer-facing portal so each client can:
- Log in with their own credentials
- See their meal plans, with the current week visually distinguished
- See today's meals as a landing experience
- Mark meals as eaten or skipped
- Leave per-meal reviews (rating + comment + quick-tag chips + photo)
- Browse plan history (past weeks)
- See a read-only profile

Mobile-first: customers will overwhelmingly access this on phones. The admin app remains unchanged for daily admin work, but gains: invite flow, customer-description field on recipes, a reviews inbox, review badges on the meal-plan grid, aggregate ratings on recipe pages, and a small CRUD for review tags.

The portal is purely informational + feedback — no payment, no checkout, no scheduling changes from the customer side.

## Architecture

**Routing.** Customer portal lives under `/portal/*` with its own layout (no admin sidebar). Admin app stays under `/(authenticated)/*`. Login is unified at `/login`; after auth, server-side redirect routes admin → `/`, customer → `/portal`. Middleware enforces role-to-route mapping.

**Roles.** Mutually exclusive admin/customer flag. New `profiles` table keyed by `auth.users.id` with `role` and `client_id` (nullable). One row per auth user, created via DB trigger; existing admin backfilled.

**Auth flow.** Admin clicks "Invite to portal" on a client row → server route uses Supabase service role to call `admin.inviteUserByEmail(client.email)` → Supabase sends "set your password" email → on first sign-in a trigger materializes the customer's `profiles` row with `client_id` resolved by email match against `clients`.

**RLS rewrite.** Replace the blanket `auth.uid() IS NOT NULL` policies with role-aware ones. Customer sees only their own client row, only their own meal plans + entries, only their own reviews and statuses. Ingredients and recipes are read-only for customers (needed for rendering plan content). Admin retains full access. Two helper SQL functions kept for policy readability: `is_admin()` and `current_client_id()`.

**Storage.** Private Supabase Storage bucket `meal-review-photos` for review photos. Path convention `{client_id}/{review_id}.{ext}`. Signed URLs only. RLS limits customers to their own folder; admin reads all. Client-side image compression to ~1200px / 80% JPEG before upload.

**PWA.** Manifest + icons + theme color so the portal installs to the home screen. Service worker caches the app shell and the most-recently-loaded plan JSON for offline read; review/status writes queue in localStorage and replay on reconnect (best-effort; not a full sync engine).

## Data model

**New tables**

`profiles`
- `id` UUID PK (= `auth.users.id`)
- `role` TEXT CHECK (`'admin'`, `'customer'`)
- `client_id` UUID FK→`clients` (nullable; required when role = customer)
- `created_at` TIMESTAMPTZ

`review_tags` (admin-managed quick-tag chips)
- `id` UUID PK, `label` TEXT, `sentiment` TEXT CHECK (`'positive'`, `'negative'`, `'neutral'`), `sort_order` INT, `active` BOOLEAN, `created_at`
- Seeded with starter tags (e.g., "loved it", "perfect portion", "too salty", "too small", "too bland", "reheat issues") — admin can edit on a settings page

`meal_reviews`
- `id` UUID PK
- `meal_plan_entry_id` FK→`meal_plan_entries` CASCADE UNIQUE — one review per slot, customer can edit
- `client_id` FK→`clients` CASCADE
- `recipe_id` FK→`recipes` SET NULL (denormalized so aggregates survive entry deletion)
- `rating` INT CHECK 1–5
- `comment` TEXT (nullable)
- `photo_path` TEXT (nullable; Supabase Storage key)
- `admin_read_at` TIMESTAMPTZ (nullable)
- `created_at`, `updated_at` TIMESTAMPTZ

`meal_review_tags` (junction)
- `review_id` FK→`meal_reviews` CASCADE, `tag_id` FK→`review_tags` RESTRICT, PK both

`meal_entry_status` (3-state eaten/skipped — same row-presence pattern as existing `shopping_check_state` / `cooking_check_state`)
- `meal_plan_entry_id` FK→`meal_plan_entries` CASCADE PK
- `client_id` FK→`clients` CASCADE
- `status` TEXT CHECK (`'eaten'`, `'skipped'`)
- `updated_at`
- Absence of row = pending

**Schema additions to existing tables**

- `recipes.customer_description` TEXT (nullable). Customer-facing description; existing `recipes.notes` stays admin-only.
- `clients.invited_at` TIMESTAMPTZ (nullable). Admin reads `profiles` join to derive active status.

**View**

`recipe_rating_stats` — `recipe_id`, `avg_rating`, `review_count`, `last_reviewed_at`. SQL view, always fresh.

## Customer portal UX

**Layout.** Top app bar (logo + greeting + logout). Bottom tab bar (mobile) with 3 tabs: Today / Plans / Profile. On `md+`, bottom bar hides and a slim top nav appears. Generous tap targets (≥44px). Emerald-600 primary, matching the existing app palette.

**Today (`/portal`).** Hero: "Today, Tuesday Jun 9" + total kcal for the day. Vertical card stack of today's meals (breakfast → lunch → dinner → snack). Each card shows recipe name, portions, kcal/macros, status pill, review badge. Tap → meal detail sheet. Empty state with link to Plans tab if no plan covers today. Selling price of the active plan in a small footer card.

**Plans (`/portal/plans`).** All plans for this client, sorted by `week_start` desc. Current-week card has "This week" badge + emerald accent border. Past weeks dimmed; future weeks rendered plainly. Each card: plan name, week range, days covered, selling price.

**Plan detail (`/portal/plans/[id]`).** Header (name, week range, selling price, "This week" badge if current). Day picker tabs Mon–Sun (defaults to today for current week, else Monday). Below: same meal-card stack scoped to the selected day.

**Meal detail sheet** (bottom sheet on mobile, modal on desktop). Recipe name, customer description, full ingredient list (no prices), nutrition table, portions. Status segmented control (Pending / Eaten / Skipped). Review composer: 1–5 stars, quick-tag chips (multi-select, grouped positive/negative), comment textarea, photo upload (camera or library). If a review exists, shows current state with edit + "submitted on …".

**Profile (`/portal/profile`).** Read-only. Personal (name, email, phone). Targets (weight, daily calories, restrictions, allergies, preferences). Footer: logout, app version, "contact your trainer" line with admin email.

**Customer-visible vs hidden data.**
- Visible: meal plan entries, recipes (name, customer_description, ingredients without prices, nutrition), portions, **plan selling price**, plan week range.
- Hidden: ingredient prices, recipe cost, markup multiplier, admin recipe notes, container/delivery tracking, prep tasks, shopping list.

## Admin-side changes

**Client list (`app/(authenticated)/clients/`).**
- New "Portal" status column derived from `clients.invited_at` + `profiles` join:
  - **Not invited** — no `invited_at`, no profile.
  - **Invited** — `invited_at` set, profile not yet created (customer hasn't completed first sign-in).
  - **Active** — profile exists with `role='customer'` linked to this client.
  - **Disabled** — profile exists but `auth.users.banned_until` is in the future (Supabase's built-in ban field, set by the revoke-access action).
- "Invite to portal" action (disabled if `clients.email` is missing). Resend invite + revoke access for already-invited clients (revoke = set `banned_until` far in the future via service-role admin API).

**Recipes (`app/(authenticated)/recipes/`).**
- Recipe form gains a **Customer description** textarea alongside admin Notes.
- Recipe list/detail shows aggregate rating "★ 4.6 (12 reviews)" from `recipe_rating_stats`.
- Recipe detail has a Reviews section: list of recent reviews (rating, comment, tags, photo thumbnail, client name, date).

**Meal plan grid (`app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`).**
- Review badge per slot (★ + rating); tap opens review detail modal.
- Status indicator per slot (✓ eaten, ⊘ skipped). Existing layout otherwise untouched.

**Reviews inbox (`app/(authenticated)/reviews/`)** — new page.
- Feed of all reviews newest first; rows show client, recipe, rating, excerpt, tags, date, "new" badge if `admin_read_at IS NULL`.
- Filter chips: unread, by client, by recipe, by rating range, with-photo-only.
- Tap → review detail modal (shared component with recipe-detail and grid-slot views).
- "Mark as read" sets `admin_read_at`.
- Sidebar (`components/app-shell.tsx`) gets a "Reviews" item with unread-count badge.

**Review tag management (`app/(authenticated)/reviews/tags/`)** — small CRUD page over `review_tags`. Soft-disable (`active=false`) preferred over delete so existing tagged reviews keep tag history.

## Reused existing code

- Calculations: `lib/calculations/meal-plan.ts` (`calculateDay`, `calculateWeek`, `resolveTargets`) — same totals shown in customer portal.
- Recipe macro aggregation: `lib/calculations/recipe.ts` (`calculateRecipe`) — for per-meal nutrition.
- Supabase clients: `lib/supabase/server.ts`, `lib/supabase/client.ts` — extend, do not fork.
- Mobile pattern: `md:hidden` / `hidden md:block` split as used in `meal-plan-grid.tsx` and `recipes-client.tsx`.
- Nutrition presentation: mirror `lib/pdf/meal-plan.tsx` (closest existing customer-facing view).
- Validation: extend `lib/validations/schemas.ts` with review + tag + status schemas.

## Files to create / modify (representative)

**Migrations** (`supabase/migrations/`)
- `20260609000000_profiles_and_roles.sql` — profiles table, role helper functions, trigger to auto-create profile on auth user insert, backfill existing admin.
- `20260609000001_rls_role_aware.sql` — replace blanket policies on all tables with role-aware ones.
- `20260609000002_meal_reviews.sql` — review_tags + seed, meal_reviews, meal_review_tags, meal_entry_status, recipe_rating_stats view.
- `20260609000003_recipe_customer_description.sql` — recipes.customer_description, clients.invited_at.
- `20260609000004_storage_review_photos.sql` — bucket + storage RLS policies.

**App routes**
- `app/(portal)/layout.tsx`, `app/(portal)/portal/page.tsx` (Today), `app/(portal)/portal/plans/page.tsx`, `app/(portal)/portal/plans/[id]/page.tsx`, `app/(portal)/portal/profile/page.tsx`.
- `app/login/page.tsx` — post-login role-based redirect.
- `app/(authenticated)/reviews/page.tsx` (inbox), `app/(authenticated)/reviews/tags/page.tsx` (tag CRUD).
- API: `app/api/portal/invite/route.ts` (admin invites client), `app/api/portal/reviews/route.ts` (customer create/edit), `app/api/portal/status/route.ts` (eaten/skipped).

**Components**
- `components/portal/bottom-tabs.tsx`, `components/portal/meal-card.tsx`, `components/portal/meal-detail-sheet.tsx`, `components/portal/review-composer.tsx`, `components/portal/star-rating.tsx`, `components/portal/tag-chips.tsx`, `components/portal/photo-upload.tsx`.
- `components/admin/review-detail-modal.tsx` (shared across inbox / recipe page / meal-plan grid).
- `components/admin/invite-button.tsx`.
- `components/app-shell.tsx` — add Reviews nav with unread badge.

**Library**
- `lib/supabase/types.ts` — add `Profile`, `MealReview`, `ReviewTag`, `MealEntryStatus`, extend `Recipe` and `Client`.
- `lib/portal/storage.ts` — signed-URL helpers + image compression.
- `lib/validations/schemas.ts` — review/tag/status Zod schemas.

**PWA**
- `app/manifest.ts`, `public/sw.js` (or `next-pwa` config), `public/icons/` (192/512 PNG).

**Middleware**
- `middleware.ts` — fetch profile on each request, enforce role-to-route map: customers blocked from `/(authenticated)/*`, admins blocked from `/portal/*`, login redirects by role.

## Verification

End-to-end on local Supabase (`npm run db:start`).

1. **Auth & RLS.** Run migrations. Existing admin → `profiles.role='admin'`. Create test client with email; click "Invite to portal"; confirm Inbucket email; click link, set password; confirm `profiles` row created with `role='customer'` and matching `client_id`. Log in as customer → redirect `/portal`. Manually navigate to `/recipes` as customer → middleware blocks. Run RLS smoke checks via SQL editor with customer JWT: only own client/plans visible; ingredients/recipes read-only.
2. **Customer flows.** Today empty state → add a plan covering today as admin → today populates. Plans list: current-week badge + accent. Plan detail day picker defaults correctly. Meal sheet status toggle persists across reload. Submit review (4★ + 2 tags + comment + photo): photo uploads to bucket, signed URL renders in admin view. Edit review updates row in place (no duplicate). Sign out / sign back in.
3. **Admin views.** Client list portal column reflects invited/active. Meal plan grid shows review badges + status indicators. Recipe detail shows aggregate rating + reviews list. Reviews inbox: new review appears, "new" badge until marked read; sidebar unread count updates. Tag management: add a tag → appears in customer composer; deactivate → hidden in composer, preserved on past reviews.
4. **Mobile / responsive.** DevTools mobile (iPhone 14, Pixel 7): bottom bar, 44px tap targets, no horizontal scroll, sheets cover correctly. `md+`: bottom bar hides, top nav appears, sheets become centered modals.
5. **PWA.** `next build && next start`. Lighthouse PWA audit ≥ 90. Install to home screen on iOS Safari + Android Chrome — launches standalone at `/portal`. Throttle to offline after loading a plan: cached shell renders; status toggle queues and replays on reconnect.
6. **Build / typecheck.** `npm run build` passes; no TS errors.

## Out of scope

- Container-return reminder for customers
- Daily nutrition vs target progress bars
- Self-signup (admin-invite only)
- Customer-editable profile / change requests
- Notes / messages-to-admin separate from reviews
- Magic-link auth (using password instead)
- Payment / checkout
- Push notifications
