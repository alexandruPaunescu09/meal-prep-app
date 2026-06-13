# Customer portal — day scrubber & past/future meal reviews

**Date:** 2026-06-13
**Status:** Design approved, awaiting plan

## Problem

The customer portal's `/portal` page only shows the current day's meals. Customers
can't reach yesterday's meals to review them after the fact, and can't peek at
upcoming meals. The capability to load any day exists at `/portal/plans/[id]`,
and the review API has no date guard, so this is fundamentally a UX problem:
the past/future surfaces aren't discoverable from where customers actually
land.

A secondary problem surfaced during exploration: the bottom-tab navigation that
links Today / Plans / Profile is `md:hidden` (mobile-only), so on desktop
customers see only Today with no way to reach the Plans page at all.

## Goals

1. From `/portal`, let the customer move to any past or future day they have a
   plan for, in one or two taps.
2. Let the customer leave or edit reviews on past meals retroactively, using
   the existing review composer.
3. Show desktop users the same Today / Plans / Profile navigation that mobile
   users get.
4. Keep future days informational only — no premature status or review writes.

## Non-goals

- No proactive "you have N unreviewed meals" nudge. (Customer requested
  discoverability only; the missing-star cue on cards is enough.)
- No new top-level route. The day scrubber lives on `/portal`; cross-week
  navigation continues to be available at `/portal/plans/[id]`.
- No date guard added to the review/status APIs. Late writes are allowed by
  design.
- No new caching layer for portal reads. Portal pages stay per-request with
  the auth-cookie-scoped Supabase client.

## Architecture

### Routing

- **`/portal?date=YYYY-MM-DD`** — Today surface, generalized. `date` is
  optional and defaults to today's local date. The page is a server component
  that resolves the right plan for the selected date, then renders the day
  with the existing `MealCard` + `MealDetailSheet` flow.
- **`/portal/plans/[id]`** — unchanged.
- **`/portal/profile`** — unchanged.

The `?date=` URL is the source of truth for the selected day. This makes the
back button work, makes URLs shareable, and keeps client state minimal.

### Components

- **`DayScrubber`** (new client component, used on `/portal`)
  - Sliding 7-day strip of weekday/day-number pills, centered on the selected
    day where possible. Prev/next arrow buttons shift the strip by one day.
  - Calendar icon next to the strip opens a month-picker modal: customers can
    jump to any date in one tap, including dates in months not currently in
    view (prev/next month arrows inside the modal).
  - Pill states: today (emerald ring), selected (emerald fill), no-plan
    (dimmed but tappable), normal.
  - Reads `?date=` via `useSearchParams`, writes via `router.push`.

- **Generalized `/portal/page.tsx`**
  - Reads `searchParams.date`, coerces to today if missing or invalid.
  - Finds the plan covering the selected date (same `week_start`-range
    query, parameterized).
  - Computes `targetDow` from the offset between selected date and the
    plan's `week_start`.
  - Fetches entries, statuses, reviews for the selected day's entry IDs (no
    schema change to those queries — just different `targetDow`).
  - Additionally fetches a thin list of all `meal_plans` (id, week_start,
    name) for the customer, passed to `DayScrubber` so it can light up
    pills/calendar dates that have a plan.
  - Hands off to `TodayClient` with one extra prop: `isFuture` (boolean,
    derived server-side from `selectedDate > today`).

- **`TodayClient` updates**
  - Renders the new `DayScrubber` above the meal list.
  - Passes `isFuture` down to `MealDetailSheet`.

- **`MealDetailSheet` updates**
  - When `isFuture`, hide the status segmented control and the review
    composer entirely. (Hide, don't disable — disabled-looking controls on
    future-day meals create the wrong affordance.)
  - Nutrition and ingredients sections still render in the future case.

- **`PortalLayout` (`app/(portal)/layout.tsx`) updates**
  - Add a `TopNav` component (`hidden md:flex`) mirroring the existing
    `BottomTabs`. Same three links (Today, Plans, Profile), active-state
    logic copied from the mobile tabs. Sits at the top of the portal layout
    on desktop; bottom tabs continue to handle mobile.

### Data flow

1. URL has `?date=2026-06-08`.
2. Server component on `/portal` reads it, queries:
   - meal_plans where `week_start ≤ '2026-06-08' AND week_start ≥ '2026-06-02'`
     and `client_id = profile.client_id`
   - meal_plans (id, week_start, name) for the customer (for scrubber)
   - entries + joined statuses/reviews for the resolved plan + targetDow
3. Server renders `TodayClient` with the selected day's data + `isFuture`.
4. `DayScrubber` receives the selected date, the customer's plans list, and
   today's date. Renders pills accordingly.
5. Customer taps a pill → `router.push('/portal?date=…')` → server
   re-renders. No client cache to invalidate.

### Empty-day handling

If no plan covers the selected date, the page still renders the scrubber and
shows an empty-day card (`No meals scheduled for [date]`) underneath. The
customer can keep scrubbing. This replaces the current full-page "no plan
covers today" fallback when the customer is browsing an empty date — the
fallback is kept only when the customer has no plans at all.

## Permissions on past vs. future

| Action | Past | Today | Future |
|---|---|---|---|
| View meals + nutrition | yes | yes | yes |
| Mark eaten/skipped | yes (retroactive) | yes | hidden |
| Leave/edit review | yes (retroactive) | yes | hidden |

The review API and the status API are unchanged — no date guard added. The
client component decides whether to render the controls based on the
server-derived `isFuture` flag. A hand-crafted POST against a future entry
would still succeed; this is an acceptable risk because the data belongs to
the customer's own account.

## Caching & invalidation

Portal pages stay per-request (no `unstable_cache`), tied to the auth cookie.
The two write endpoints (`/api/portal/reviews`, `/api/portal/status`) keep
their existing `revalidateTag` calls for **admin** caches and the existing
`router.refresh()` from the client component. No new tags introduced.

## Error handling

- `?date=` malformed, missing, or far outside reasonable range → coerce to
  today. Never 404.
- `?date=` resolves to a date with no plan → empty-day card, scrubber stays
  interactive.
- Customer has no plans at all → existing full-page "Your trainer will share
  a plan when it's ready" fallback (unchanged).

## File-level changes

| Path | Change |
|---|---|
| `app/(portal)/layout.tsx` | Add `TopNav` (hidden md:flex). |
| `components/portal/top-nav.tsx` | New component, mirrors `BottomTabs`. |
| `components/portal/day-scrubber.tsx` | New component (strip + calendar). |
| `app/(portal)/portal/page.tsx` | Read `searchParams.date`, generalize plan resolution, fetch customer-plans list for scrubber, compute `isFuture`. |
| `app/(portal)/portal/today-client.tsx` | Render `DayScrubber`, pass `isFuture` down. |
| `components/portal/meal-detail-sheet.tsx` | Accept `isFuture` prop; hide status + review sections when true. |
| `lib/portal/entry-helpers.ts` | Possibly add a `parseLocalDate` / coerce helper if not already present. |

No database migrations. No API route changes.

## Verification

After implementation, walk the flow with the `/run` skill:

1. Sign in as a customer, land on `/portal`. Confirm desktop top-nav appears.
2. Scrub one day backward, leave a review on a past meal, confirm it appears
   in the admin reviews inbox.
3. Open the calendar picker, jump to a date inside a different week. Confirm
   the meal list updates and the strip recenters around the new selection.
4. Scrub forward into a future day. Confirm status and review controls are
   hidden, nutrition still shows.
5. Scrub to a date with no plan. Confirm empty-day card renders and the
   scrubber remains usable.
6. Use the browser back button after several scrubs. Confirm history works
   as expected.
