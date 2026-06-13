# Customer Portal — Day Scrubber & Past/Future Meal Reviews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers browse any past or future day from `/portal`, leave reviews on past meals retroactively, and reach the Plans/Profile pages from desktop.

**Architecture:** Generalize `/portal` to read `?date=YYYY-MM-DD`, server-resolve the plan covering that date, and render the existing `MealCard`/`MealDetailSheet` flow. Add a `DayScrubber` client component (sliding 7-day strip + month-picker modal) that drives the date by writing to the URL. Hide write controls (status, review composer) when the selected date is in the future. Add a `TopNav` mirror of `BottomTabs` for desktop.

**Tech Stack:** Next.js 16.2.6 App Router (server components + `useSearchParams`), React 19, TypeScript, Tailwind 4, Supabase, lucide-react.

**Verification approach:** This project has no test framework configured. Each task is verified by `npx tsc --noEmit` (type safety) plus manual walkthrough at the end against the spec's verification checklist. Steps note when to do each.

**Spec:** [docs/superpowers/specs/2026-06-13-portal-day-scrubber-design.md](../specs/2026-06-13-portal-day-scrubber-design.md)

---

## File Map

| Path | Status | Responsibility |
|---|---|---|
| `lib/portal/entry-helpers.ts` | Modify | Add `parseLocalDate(s)`, `compareLocalDate(a, b)`, `isValidLocalDate(s)`. |
| `lib/portal/plan-resolver.ts` | Create | Pure helper: given a list of plans + a date, return the covering plan + day-of-week (1..7). Used by both `/portal` and `DayScrubber`. |
| `components/portal/top-nav.tsx` | Create | Desktop-only top navigation, mirrors `BottomTabs`. |
| `components/portal/day-scrubber.tsx` | Create | Sliding 7-day strip + calendar-icon button. Reads `?date=` and writes via `router.push`. |
| `components/portal/calendar-picker.tsx` | Create | Month-grid modal opened by `DayScrubber`. |
| `app/(portal)/layout.tsx` | Modify | Render `TopNav` (`hidden md:flex`) below `TopBar`. |
| `app/(portal)/portal/page.tsx` | Modify | Read `searchParams.date`, generalize plan resolution via `plan-resolver`, fetch all of customer's plans (id/week_start/name), pass `selectedDate`/`isFuture`/`plansForScrubber` to `TodayClient`. |
| `app/(portal)/portal/today-client.tsx` | Modify | Render `DayScrubber` above the meal list, accept new props, swap "Today" header to use the selected date, pass `isFuture` to `MealDetailSheet`. |
| `components/portal/meal-detail-sheet.tsx` | Modify | Accept `isFuture` prop; hide status section + review composer entirely when true. |

No DB migrations. No API changes.

---

### Task 1: Date helpers — parse, validate, compare

**Files:**
- Modify: `lib/portal/entry-helpers.ts`

- [ ] **Step 1: Add the helpers**

Append the following to `lib/portal/entry-helpers.ts` (do not remove existing exports):

```ts
/**
 * Parse a YYYY-MM-DD string into a local-time Date (no timezone shifts).
 * Returns null if the string is malformed or doesn't denote a real calendar date.
 */
export function parseLocalDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map((p) => parseInt(p, 10));
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

/** True iff `s` is a valid YYYY-MM-DD calendar date. */
export function isValidLocalDate(s: string): boolean {
  return parseLocalDate(s) !== null;
}

/**
 * Compare two YYYY-MM-DD strings as calendar dates.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 * Lexicographic comparison is correct for this format.
 */
export function compareLocalDate(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/portal/entry-helpers.ts
git commit -m "Portal: add parseLocalDate, isValidLocalDate, compareLocalDate helpers"
```

---

### Task 2: Plan resolver — covering plan + dow for any date

**Files:**
- Create: `lib/portal/plan-resolver.ts`

- [ ] **Step 1: Create the file**

```ts
import { MealPlan } from "@/lib/supabase/types";
import { addDaysLocal, compareLocalDate } from "./entry-helpers";

export interface ResolvedPlanForDate {
  plan: MealPlan;
  /** 1=Mon … 7=Sun, matching meal_plan_entries.day_of_week */
  dayOfWeek: number;
}

/**
 * Given a customer's plans and a YYYY-MM-DD date, return the plan whose
 * 7-day window covers that date plus the day_of_week within that plan.
 * If multiple plans overlap the date (shouldn't happen in normal use,
 * but is allowed by the schema), prefer the one with the latest week_start.
 * Returns null when no plan covers the date.
 */
export function resolvePlanForDate(
  plans: MealPlan[],
  dateStr: string
): ResolvedPlanForDate | null {
  let best: ResolvedPlanForDate | null = null;
  for (const plan of plans) {
    const start = plan.week_start;
    const end = addDaysLocal(start, 6);
    if (compareLocalDate(dateStr, start) < 0) continue;
    if (compareLocalDate(dateStr, end) > 0) continue;
    const offset = daysBetween(start, dateStr);
    const dow = offset + 1;
    if (!best || compareLocalDate(plan.week_start, best.plan.week_start) > 0) {
      best = { plan, dayOfWeek: dow };
    }
  }
  return best;
}

/** Days between two YYYY-MM-DD strings (b - a). */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map((p) => parseInt(p, 10));
  const [by, bm, bd] = b.split("-").map((p) => parseInt(p, 10));
  const da = new Date(ay, am - 1, ad).getTime();
  const db = new Date(by, bm - 1, bd).getTime();
  return Math.round((db - da) / 86400000);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/portal/plan-resolver.ts
git commit -m "Portal: add resolvePlanForDate helper"
```

---

### Task 3: Desktop top navigation

**Files:**
- Create: `components/portal/top-nav.tsx`
- Modify: `app/(portal)/layout.tsx`

- [ ] **Step 1: Create `top-nav.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, User } from "lucide-react";

const tabs = [
  { href: "/portal", label: "Today", icon: Home, exact: true },
  { href: "/portal/plans", label: "Plans", icon: CalendarDays, exact: false },
  { href: "/portal/profile", label: "Profile", icon: User, exact: false },
];

export default function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:block bg-white border-b border-gray-200">
      <ul className="max-w-3xl mx-auto px-4 flex gap-1">
        {tabs.map((t) => {
          const active = t.exact
            ? pathname === t.href
            : pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                  active
                    ? "text-emerald-700 border-emerald-600"
                    : "text-gray-600 border-transparent hover:text-gray-900"
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: Wire `TopNav` into the portal layout**

Edit `app/(portal)/layout.tsx`. Add the import and render `<TopNav />` below `<TopBar />`. The full updated return block should read:

```tsx
return (
  <div className="min-h-full bg-gray-50 pb-20 md:pb-0">
    <TopBar greeting={greeting} />
    <TopNav />
    <main className="max-w-3xl mx-auto px-4 py-4">{children}</main>
    <BottomTabs />
  </div>
);
```

Add `import TopNav from "@/components/portal/top-nav";` near the other portal component imports at the top of the file.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/portal/top-nav.tsx app/\(portal\)/layout.tsx
git commit -m "Portal: add desktop top navigation"
```

---

### Task 4: Calendar picker modal

**Files:**
- Create: `components/portal/calendar-picker.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import {
  formatLocalDate,
  parseLocalDate,
  compareLocalDate,
} from "@/lib/portal/entry-helpers";

interface Props {
  /** Currently-selected date (YYYY-MM-DD). The calendar opens on its month. */
  selectedDate: string;
  /** Today's local date (YYYY-MM-DD) — passed in so server-rendered ‘today’
   *  matches the client. */
  todayDate: string;
  /** Set of YYYY-MM-DD strings the customer has a plan covering. Used to
   *  highlight days; does not restrict selection. */
  planDates: Set<string>;
  onPick: (dateStr: string) => void;
  onClose: () => void;
}

export default function CalendarPicker({
  selectedDate,
  todayDate,
  planDates,
  onPick,
  onClose,
}: Props) {
  const initial = parseLocalDate(selectedDate) ?? parseLocalDate(todayDate)!;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth()); // 0..11

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" }
  );

  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  // Build a Mon-first 6-row grid covering the visible month.
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const jsDow = firstOfMonth.getDay(); // 0=Sun..6=Sat
  const leading = jsDow === 0 ? 6 : jsDow - 1;
  const gridStart = new Date(viewYear, viewMonth, 1 - leading);

  const cells: { date: Date; dateStr: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i
    );
    cells.push({
      date: d,
      dateStr: formatLocalDate(d),
      inMonth: d.getMonth() === viewMonth && d.getFullYear() === viewYear,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-sm rounded-t-2xl md:rounded-2xl shadow-xl overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="p-2 -m-2 rounded-lg hover:bg-gray-100"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <p className="text-sm font-semibold text-gray-900">{monthLabel}</p>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="p-2 -m-2 rounded-lg hover:bg-gray-100"
            aria-label="Next month"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div
                key={i}
                className="text-[10px] uppercase text-gray-500 font-medium text-center py-1"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((c) => {
              const isSelected = compareLocalDate(c.dateStr, selectedDate) === 0;
              const isToday = compareLocalDate(c.dateStr, todayDate) === 0;
              const hasPlan = planDates.has(c.dateStr);
              const base =
                "h-10 rounded-lg text-sm flex items-center justify-center font-medium border";
              const stateClass = isSelected
                ? "bg-emerald-600 text-white border-emerald-600"
                : isToday
                ? "bg-white text-emerald-700 border-emerald-400"
                : hasPlan
                ? "bg-white text-gray-900 border-gray-200 hover:border-gray-300"
                : "bg-white text-gray-400 border-gray-100 hover:border-gray-200";
              const dimMonth = c.inMonth ? "" : "opacity-40";
              return (
                <button
                  key={c.dateStr}
                  type="button"
                  onClick={() => onPick(c.dateStr)}
                  className={`${base} ${stateClass} ${dimMonth}`}
                >
                  {c.date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 pb-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-sm text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/portal/calendar-picker.tsx
git commit -m "Portal: add CalendarPicker month-grid modal"
```

---

### Task 5: Day scrubber (sliding 7-day strip + calendar trigger)

**Files:**
- Create: `components/portal/day-scrubber.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import {
  addDaysLocal,
  compareLocalDate,
  formatLocalDate,
  parseLocalDate,
} from "@/lib/portal/entry-helpers";
import CalendarPicker from "./calendar-picker";

interface Props {
  /** YYYY-MM-DD currently shown. Drives the strip's centering. */
  selectedDate: string;
  /** YYYY-MM-DD of today (server-provided so it matches the page render). */
  todayDate: string;
  /** All YYYY-MM-DD strings the customer has a plan covering. */
  planDates: Set<string>;
}

export default function DayScrubber({
  selectedDate,
  todayDate,
  planDates,
}: Props) {
  const router = useRouter();
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Window of 7 dates centered on selectedDate (offset -3..+3).
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysLocal(selectedDate, i - 3));
  }, [selectedDate]);

  function navigate(dateStr: string) {
    router.push(`/portal?date=${dateStr}`);
  }

  function shift(delta: number) {
    navigate(addDaysLocal(selectedDate, delta));
  }

  function pickFromCalendar(dateStr: string) {
    setCalendarOpen(false);
    navigate(dateStr);
  }

  const selectedLabel = formatHeader(selectedDate, todayDate);

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-emerald-600 font-medium">
            {selectedLabel.eyebrow}
          </p>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 min-h-[36px]"
            aria-label="Open calendar"
          >
            <CalendarDays className="w-4 h-4" />
            Calendar
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1 grid grid-cols-7 gap-1">
            {days.map((d) => {
              const isSelected = compareLocalDate(d, selectedDate) === 0;
              const isToday = compareLocalDate(d, todayDate) === 0;
              const hasPlan = planDates.has(d);
              const dt = parseLocalDate(d)!;
              const weekday = dt.toLocaleDateString(undefined, {
                weekday: "short",
              });
              const dayNum = dt.getDate();
              const base =
                "flex flex-col items-center justify-center min-h-[56px] rounded-xl border text-sm font-medium";
              const stateClass = isSelected
                ? "bg-emerald-600 text-white border-emerald-600"
                : isToday
                ? "bg-white text-emerald-700 border-emerald-400"
                : hasPlan
                ? "bg-white text-gray-900 border-gray-200 hover:border-gray-300"
                : "bg-white text-gray-400 border-gray-100 hover:border-gray-200";
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => navigate(d)}
                  className={`${base} ${stateClass}`}
                >
                  <span className="text-[10px] uppercase tracking-wide opacity-80">
                    {weekday}
                  </span>
                  <span className="text-base leading-tight">{dayNum}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => shift(1)}
            className="p-2 rounded-lg hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Next day"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {calendarOpen && (
        <CalendarPicker
          selectedDate={selectedDate}
          todayDate={todayDate}
          planDates={planDates}
          onPick={pickFromCalendar}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </>
  );
}

function formatHeader(selectedDate: string, todayDate: string) {
  const cmp = compareLocalDate(selectedDate, todayDate);
  if (cmp === 0) return { eyebrow: "Today" };
  if (cmp < 0) return { eyebrow: "Past" };
  return { eyebrow: "Upcoming" };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/portal/day-scrubber.tsx
git commit -m "Portal: add DayScrubber 7-day strip + calendar trigger"
```

---

### Task 6: `MealDetailSheet` accepts `isFuture`

**Files:**
- Modify: `components/portal/meal-detail-sheet.tsx`

- [ ] **Step 1: Add the `isFuture` prop and gate the write sections**

Edit `components/portal/meal-detail-sheet.tsx`. Update the props type and the JSX:

In the props type block, add `isFuture: boolean;` so the type reads:

```tsx
}: {
  entry: FullEntry;
  existingReview: MealReview | null;
  existingStatus: MealStatus | null;
  isFuture: boolean;
  onClose: () => void;
}) {
```

Update the function parameter destructuring to include `isFuture`:

```tsx
export default function MealDetailSheet({
  entry,
  existingReview,
  existingStatus,
  isFuture,
  onClose,
}: {
```

In the JSX body, wrap the "Did you eat this?" section and the review section so they only render when `!isFuture`. The status `<section>` (the one starting `<h3>Did you eat this?</h3>`) should be wrapped:

```tsx
{!isFuture && (
  <section>
    <h3 className="text-sm font-semibold text-gray-900 mb-2">Did you eat this?</h3>
    {/* …existing SegBtn grid unchanged… */}
  </section>
)}
```

And the review section (the one with `<h3>{existingReview ? "Your review" : "Leave a review"}</h3>`):

```tsx
{!isFuture && (
  <section className="pt-2 border-t">
    <h3 className="text-sm font-semibold text-gray-900 mb-3">
      {existingReview ? "Your review" : "Leave a review"}
    </h3>
    <ReviewComposer
      entryId={entry.id}
      existingReview={existingReview}
      onSaved={() => onClose()}
    />
  </section>
)}
```

The Nutrition section and the Ingredients section stay rendered unconditionally.

- [ ] **Step 2: Typecheck (will fail at the call sites — that's expected)**

Run: `npx tsc --noEmit`
Expected: errors at the two call sites of `MealDetailSheet` complaining that `isFuture` is missing. We fix them in Tasks 7 and 8.

- [ ] **Step 3: Commit**

```bash
git add components/portal/meal-detail-sheet.tsx
git commit -m "Portal: gate status + review composer on isFuture"
```

---

### Task 7: Update `/portal/plans/[id]` to pass `isFuture`

**Files:**
- Modify: `app/(portal)/portal/plans/[id]/plan-detail-client.tsx`
- Modify: `app/(portal)/portal/plans/[id]/page.tsx`

Within an entire-plan view the customer can already pick any day pill — including future days within an upcoming plan. We need to compute `isFuture` for the **currently-open meal** (whose entry's `day_of_week` lives inside the plan, mapped through `plan.week_start`).

- [ ] **Step 1: Pass `todayDate` from the page**

Edit `app/(portal)/portal/plans/[id]/page.tsx`. After the existing `const todayStr = formatLocalDate(today);` line, change the `<PlanDetailClient … />` render to also pass `todayDate`:

```tsx
return (
  <PlanDetailClient
    plan={plan}
    entries={(entries as any[]) ?? []}
    statuses={(statusesRes.data as MealEntryStatus[]) ?? []}
    reviews={(reviewsRes.data as MealReview[]) ?? []}
    isCurrent={isCurrent}
    initialDow={initialDow}
    todayDate={todayStr}
  />
);
```

- [ ] **Step 2: Compute `isFuture` for the open entry in the client**

Edit `app/(portal)/portal/plans/[id]/plan-detail-client.tsx`. Add `todayDate: string;` to the props type and destructuring. Add `addDaysLocal, compareLocalDate` to the existing `entry-helpers` import:

```tsx
import {
  entryNutrition,
  sortByMealType,
  addDaysLocal,
  compareLocalDate,
} from "@/lib/portal/entry-helpers";
```

Compute the `isFuture` flag for the currently-open entry just before rendering `MealDetailSheet`. Find this block:

```tsx
const open = openEntryId ? entries.find((e) => e.id === openEntryId) ?? null : null;
const openReview = open ? reviews.find((r) => r.meal_plan_entry_id === open.id) ?? null : null;
const openStatus = open ? statuses.find((s) => s.meal_plan_entry_id === open.id) ?? null : null;
```

…and add immediately after it:

```tsx
const openDate = open
  ? addDaysLocal(plan.week_start, open.day_of_week - 1)
  : null;
const openIsFuture = openDate
  ? compareLocalDate(openDate, todayDate) > 0
  : false;
```

Then update the `MealDetailSheet` render to pass the flag:

```tsx
{open && (
  <MealDetailSheet
    entry={open}
    existingReview={openReview}
    existingStatus={openStatus?.status ?? null}
    isFuture={openIsFuture}
    onClose={() => setOpenEntryId(null)}
  />
)}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only at `/portal/page.tsx`'s call site (Task 8).

- [ ] **Step 4: Commit**

```bash
git add app/\(portal\)/portal/plans/\[id\]/page.tsx app/\(portal\)/portal/plans/\[id\]/plan-detail-client.tsx
git commit -m "Portal: pass isFuture to MealDetailSheet from plan detail view"
```

---

### Task 8: Generalize `/portal` page — accept `?date=`, fetch scrubber data

**Files:**
- Modify: `app/(portal)/portal/page.tsx`

- [ ] **Step 1: Replace the page body**

Replace the entire contents of `app/(portal)/portal/page.tsx` with:

```tsx
import { createServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Client,
  MealEntryStatus,
  MealPlan,
  MealPlanEntry,
  MealReview,
} from "@/lib/supabase/types";
import {
  addDaysLocal,
  compareLocalDate,
  formatLocalDate,
  isValidLocalDate,
} from "@/lib/portal/entry-helpers";
import { resolvePlanForDate } from "@/lib/portal/plan-resolver";
import TodayClient from "./today-client";
import Link from "next/link";

export default async function PortalTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const supabase = await createServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.client_id) redirect("/login");

  const today = new Date();
  const todayStr = formatLocalDate(today);
  const params = await searchParams;
  const requested = params?.date;
  const selectedDate =
    requested && isValidLocalDate(requested) ? requested : todayStr;

  // Fetch every plan for this customer (used for both resolution and the
  // scrubber's plan-date highlights). This is a small list per customer.
  const { data: allPlansData } = await supabase
    .from("meal_plans")
    .select("*")
    .eq("client_id", profile.client_id)
    .order("week_start", { ascending: false });

  const allPlans = (allPlansData as MealPlan[] | null) ?? [];

  // Build the set of YYYY-MM-DD dates the customer has a plan covering.
  const planDates: string[] = [];
  for (const p of allPlans) {
    for (let i = 0; i < 7; i++) planDates.push(addDaysLocal(p.week_start, i));
  }

  if (allPlans.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-gray-900">
          Today,{" "}
          {today.toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </h1>
        <div className="bg-white rounded-2xl border p-6 text-center">
          <p className="text-gray-700 font-medium">
            No plan covers today yet.
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Your trainer will share a plan when it&apos;s ready.
          </p>
          <Link
            href="/portal/plans"
            className="inline-block mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium"
          >
            View past plans
          </Link>
        </div>
      </div>
    );
  }

  const resolved = resolvePlanForDate(allPlans, selectedDate);

  let entries: MealPlanEntry[] = [];
  let statuses: MealEntryStatus[] = [];
  let reviews: MealReview[] = [];
  let planName: string | null = null;
  let planId: string | null = null;
  let markup = 2.5;

  if (resolved) {
    const { plan, dayOfWeek } = resolved;
    planName = plan.name;
    planId = plan.id;
    markup = plan.markup_multiplier;

    const { data: entriesData } = await supabase
      .from("meal_plan_entries")
      .select(
        `
        *,
        recipe:recipes (
          *,
          recipe_ingredients (
            *,
            ingredient:ingredients (*)
          )
        ),
        ingredient:ingredients (*)
      `
      )
      .eq("meal_plan_id", plan.id)
      .eq("day_of_week", dayOfWeek);

    entries = (entriesData as MealPlanEntry[] | null) ?? [];
    const entryIds = entries.map((e) => e.id);

    if (entryIds.length) {
      const [statusesRes, reviewsRes] = await Promise.all([
        supabase
          .from("meal_entry_status")
          .select("*")
          .in("meal_plan_entry_id", entryIds),
        supabase
          .from("meal_reviews")
          .select("*")
          .in("meal_plan_entry_id", entryIds),
      ]);
      statuses = (statusesRes.data as MealEntryStatus[]) ?? [];
      reviews = (reviewsRes.data as MealReview[]) ?? [];
    }
  }

  const isFuture = compareLocalDate(selectedDate, todayStr) > 0;

  return (
    <TodayClient
      planId={planId}
      planName={planName}
      sellingPriceMarkup={markup}
      selectedDate={selectedDate}
      todayDate={todayStr}
      isFuture={isFuture}
      planDates={planDates}
      entries={(entries as any[]) ?? []}
      statuses={statuses}
      reviews={reviews}
    />
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors at the `TodayClient` call site (props don't match yet) — fixed in Task 9.

- [ ] **Step 3: Commit**

```bash
git add app/\(portal\)/portal/page.tsx
git commit -m "Portal: read ?date= and resolve covering plan via plan-resolver"
```

---

### Task 9: Wire `TodayClient` to scrubber + new props

**Files:**
- Modify: `app/(portal)/portal/today-client.tsx`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `app/(portal)/portal/today-client.tsx` with:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  Ingredient,
  MealEntryStatus,
  MealPlanEntry,
  MealReview,
  Recipe,
  RecipeIngredient,
} from "@/lib/supabase/types";
import MealCard, { MealCardData } from "@/components/portal/meal-card";
import MealDetailSheet from "@/components/portal/meal-detail-sheet";
import DayScrubber from "@/components/portal/day-scrubber";
import {
  entryNutrition,
  parseLocalDate,
  sortByMealType,
} from "@/lib/portal/entry-helpers";

type FullEntry = MealPlanEntry & {
  recipe?: Recipe & {
    recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient })[];
  };
  ingredient?: Ingredient;
};

export default function TodayClient({
  planId,
  planName,
  selectedDate,
  todayDate,
  isFuture,
  planDates,
  entries,
  statuses,
  reviews,
}: {
  planId: string | null;
  planName: string | null;
  sellingPriceMarkup: number;
  selectedDate: string;
  todayDate: string;
  isFuture: boolean;
  planDates: string[];
  entries: FullEntry[];
  statuses: MealEntryStatus[];
  reviews: MealReview[];
}) {
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  const sorted = useMemo(() => sortByMealType(entries), [entries]);
  const planDateSet = useMemo(() => new Set(planDates), [planDates]);

  const cards: MealCardData[] = useMemo(() => {
    const byEntry = new Map(statuses.map((s) => [s.meal_plan_entry_id, s]));
    const reviewByEntry = new Map(
      reviews.map((r) => [r.meal_plan_entry_id, r])
    );
    return sorted.map((e) => {
      const n = entryNutrition(e);
      return {
        entryId: e.id,
        mealType: e.meal_type,
        recipeName: e.recipe?.name ?? null,
        ingredientName: e.ingredient?.name ?? null,
        portions: e.portions,
        quantity: e.quantity,
        calories: n.calories,
        protein: n.protein,
        carbs: n.carbs,
        fat: n.fat,
        status: byEntry.get(e.id)?.status ?? null,
        rating: reviewByEntry.get(e.id)?.rating ?? null,
      };
    });
  }, [sorted, statuses, reviews]);

  const totalKcal = cards.reduce((s, c) => s + c.calories, 0);

  const selectedJsDate = parseLocalDate(selectedDate);
  const dateLabel = selectedJsDate
    ? selectedJsDate.toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : selectedDate;

  const open = openEntryId
    ? sorted.find((e) => e.id === openEntryId) ?? null
    : null;
  const openReview = open
    ? reviews.find((r) => r.meal_plan_entry_id === open.id) ?? null
    : null;
  const openStatus = open
    ? statuses.find((s) => s.meal_plan_entry_id === open.id) ?? null
    : null;

  return (
    <div className="space-y-4">
      <DayScrubber
        selectedDate={selectedDate}
        todayDate={todayDate}
        planDates={planDateSet}
      />

      <section>
        <h1 className="text-2xl font-bold text-gray-900">{dateLabel}</h1>
        <p className="text-sm text-gray-600 mt-1">
          {cards.length > 0 && (
            <>
              <span className="font-medium text-gray-900">
                {Math.round(totalKcal)} kcal
              </span>
              {planName ? " · " : null}
            </>
          )}
          {planName && <span className="text-gray-500">{planName}</span>}
        </p>
      </section>

      {cards.length === 0 ? (
        <div className="bg-white rounded-2xl border p-6 text-center text-gray-500 text-sm">
          {planId
            ? "No meals scheduled for this day."
            : "No plan covered this day."}
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => (
            <MealCard
              key={c.entryId}
              meal={c}
              onTap={() => setOpenEntryId(c.entryId)}
            />
          ))}
        </div>
      )}

      {open && (
        <MealDetailSheet
          entry={open}
          existingReview={openReview}
          existingStatus={openStatus?.status ?? null}
          isFuture={isFuture}
          onClose={() => setOpenEntryId(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 3: Commit**

```bash
git add app/\(portal\)/portal/today-client.tsx
git commit -m "Portal: render DayScrubber and pass isFuture to MealDetailSheet"
```

---

### Task 10: Build sanity check

**Files:** none.

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no new errors. (Pre-existing warnings unrelated to this work are acceptable.)

- [ ] **Step 2: Typecheck (final)**

Run: `npx tsc --noEmit`
Expected: clean exit.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds. Watch for any "missing searchParams" or "static rendering" complaints related to the new `searchParams` usage on `/portal`. If Next 16 complains that `/portal` should be dynamic, add `export const dynamic = "force-dynamic";` at the top of `app/(portal)/portal/page.tsx` and re-run.

- [ ] **Step 4: Commit (only if `force-dynamic` was added)**

```bash
git add app/\(portal\)/portal/page.tsx
git commit -m "Portal: force-dynamic now that /portal reads searchParams"
```

---

### Task 11: Manual verification

**Files:** none.

Follow the spec's verification checklist with the running app. Use the `/run` skill to launch the dev server and walk through each step.

- [ ] **Step 1: Sign in as a customer; land on `/portal`**
  - Confirm a desktop top nav appears (Today / Plans / Profile) on a wide window.
  - Confirm the day strip shows seven pills with today centered and emerald-rung.
  - Confirm the meal list matches today's meals.

- [ ] **Step 2: Scrub one day backward**
  - Tap the pill to the left of today (or the left arrow).
  - URL updates to `/portal?date=…`.
  - Yesterday's meals (or empty card) render.

- [ ] **Step 3: Leave a review on a past meal**
  - Open a past meal, fill the star rating, submit.
  - Sign in as the admin in another browser session. Open `/reviews`. Confirm the review appears as unread.

- [ ] **Step 4: Calendar picker**
  - Tap "Calendar" on the scrubber. The month-grid modal opens.
  - Use the prev-month arrow to step back a month, then pick a date in a different week.
  - Confirm the modal closes and the page shows that day's meals (or empty card if no plan covers it).

- [ ] **Step 5: Scrub forward into a future day**
  - Use the right arrow to move past today (must require an upcoming plan to exist; if none, scrub to a no-plan date instead).
  - Confirm the meal cards render but tapping a meal shows nutrition + ingredients only — no "Did you eat this?" segmented control, no review composer.

- [ ] **Step 6: No-plan day**
  - Scrub far back or forward into a date with no plan.
  - Confirm the empty card "No plan covered this day." renders. The scrubber stays usable.

- [ ] **Step 7: Browser back button**
  - After a few scrubs, press the browser back button. Confirm earlier selections come back in order.

- [ ] **Step 8: Mobile width**
  - Resize the window to mobile (~390px). Confirm the bottom tabs reappear and the top nav hides.
  - Confirm the day strip wraps reasonably and pills remain tappable (≥44px tall).

- [ ] **Step 9: No-test sentinel commit**

If any small fixes were needed during manual verification, commit them with descriptive messages per fix. If everything passed without changes, no commit needed.

---

## Self-Review

**Spec coverage:**
- Goal 1 (browse past/future): Tasks 5, 8, 9 — strip + calendar + page generalization. ✓
- Goal 2 (review past meals): no API change needed; sheet permits writes when `!isFuture` (Task 6) and the page sets `isFuture` correctly for past dates (Task 8). ✓
- Goal 3 (desktop nav): Task 3. ✓
- Goal 4 (future read-only): Task 6 hides controls; Task 8 computes `isFuture` server-side. ✓
- Non-goal "no nudge": no task adds a banner. ✓
- Non-goal "no new route": only `/portal` is modified, plus its existing children consume the new sheet prop. ✓
- Non-goal "no DB / API change": confirmed across tasks — only client + server-component edits. ✓
- Empty-day handling: Task 8 (server returns no plan with `planId=null`) + Task 9 (TodayClient renders the empty card). ✓
- Caching: untouched per spec — no `unstable_cache` introduced. ✓
- Error: invalid `?date=` coerces to today (Task 8 `isValidLocalDate` check). ✓
- File-level changes table from spec: every entry mapped to a task above. The spec also flagged "possibly add a `parseLocalDate` helper" — Task 1 adds it. ✓

**Placeholder scan:** No "TBD"/"TODO"/"add validation"/"similar to" — code is shown wherever code is written. The verification task references the running app, which is fine because steps describe exact actions with expected outcomes.

**Type consistency:**
- `MealPlan` from `@/lib/supabase/types` — used in `plan-resolver.ts` and `page.tsx`. ✓
- `resolvePlanForDate` returns `{ plan, dayOfWeek }` — Task 8 destructures the same shape. ✓
- `DayScrubber` props (`selectedDate`, `todayDate`, `planDates: Set<string>`) — `TodayClient` passes a `Set<string>` built via `useMemo`. ✓
- `CalendarPicker` props match how `DayScrubber` calls it (`selectedDate`, `todayDate`, `planDates`, `onPick`, `onClose`). ✓
- `MealDetailSheet`'s new `isFuture: boolean` prop — passed by both `today-client.tsx` (Task 9) and `plan-detail-client.tsx` (Task 7). ✓
- `TodayClient` props (`planId: string | null`, `planName: string | null`, `selectedDate`, `todayDate`, `isFuture`, `planDates: string[]`, …) — `page.tsx` passes exactly these (Task 8). The previous `sellingPriceMarkup` prop is preserved in the type for source compatibility but no longer used by the component body — kept to avoid touching the page-side prop name. ✓
