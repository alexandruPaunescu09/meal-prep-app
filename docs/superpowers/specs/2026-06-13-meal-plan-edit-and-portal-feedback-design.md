# Meal Plan Inline Edit + Portal Date-Change Feedback — Design

**Date:** 2026-06-13
**Status:** Approved, ready for implementation plan

Two unrelated UX improvements packaged in one spec because they were brainstormed together.
They share no code paths and can be implemented and merged independently.

---

## Part 1 — Inline Quantity Editing in the Meal Plan Grid

### Problem

In `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`, an entry's quantity
(`×3` for recipe portions, `200g` for ingredient grams) is read-only after add.
To change it the user must remove the entry and re-add with the new value.

### Goal

Edit `portions` on a recipe entry, and `quantity` on an ingredient entry, in
place, without leaving the grid. Match the optimistic-update pattern already
used by add/move/delete.

### Scope

- File: `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`
- Affected components: `DraggableEntry` (desktop grid) and the mobile day-stack
  row rendering inside the `md:hidden` block.
- No DB schema change. No new API. No new server action.

### Trigger

| Surface | Trigger | Editor surface |
| --- | --- | --- |
| Desktop (`DraggableEntry`) | Click the value text (`×3` or `200g`) | Inline number input replacing the text |
| Mobile (day-stack row) | Tap the row outside the X button | Small popover above/below the row |

The desktop grip-handle, name, status icon, rating, and X button retain their
current behavior. Only the value text becomes a click target.

The mobile popover duplicates `SlotPicker`'s portion/quantity input markup
inline (~15 lines). Don't extract a shared component — the two callers have
different containers (modal vs popover) and different button rows, and the
shared surface area is small enough that duplication reads cleaner than an
abstracted props bag.

### Editor Behavior — Desktop Inline

- Clicking the value swaps the text for a focused `<input type="number" />`
  with two inline buttons: `✓` (Check icon, emerald) and `✗` (X icon, gray).
- **Save triggers:** Enter key, click `✓`, or blur (focus leaves the input).
- **Cancel triggers:** Escape key, or `onMouseDown` on `✗` (mousedown so it
  fires before the input's blur — clicking the cancel button must not
  accidentally save).
- **Validation:** mirrors `SlotPicker`.
  - Recipe entries: `min=0.1`, `step=0.1`. Empty / zero / NaN → `✓` disabled,
    Enter no-op, blur reverts.
  - Ingredient entries: `min=1`, `step=1`. Same disable / revert rules.
- A single edit-state object lives in component state, e.g.
  `{ entryId, value, kind: "portions" | "quantity" }`. At most one entry is
  edited at a time. Opening an editor on entry B while entry A is editing
  closes A without saving.

### Editor Behavior — Mobile Popover

- Tapping the entry row opens a small popover anchored to the row.
- Recipe entries show a portions input (number, `step=0.1 min=0.1`) prefilled
  with current `portions`.
- Ingredient entries show a quantity input (number, `step=1 min=1`) prefilled
  with current `quantity`. Per the schema, ingredient entries also have
  `portions` (default 1, supports fractional). The popover exposes `portions`
  too so the field is reachable; in practice it is rarely changed.
- Buttons: `Save` (emerald, primary), `Cancel` (outline). No blur-to-save on
  mobile — explicit confirmation only.
- Same validation rules as desktop.

### Save (Both Surfaces)

Optimistic update mirroring the existing `removeEntry` / `addEntry` pattern:

1. Snapshot current `entries`.
2. Update local `entries` to the new value.
3. Mark the entry as "saving" (new local state — see "Saving indicator").
4. Fire Supabase `update` against the row by id, setting `portions` and/or
   `quantity` as appropriate.
5. On success: clear "saving", call `invalidateMealPlan(plan.id)`. Skip
   `router.refresh()` — recipe nutrition / ingredient nutrition are already
   present on the in-memory entry, so the visible totals recompute correctly
   from the updated `quantity` / `portions` without a server round-trip.
6. On error: restore from snapshot, clear "saving", `alert()` with the error
   message (matches existing handling in `addEntry`, `removeEntry`,
   `handleDragEnd`).

### Saving Indicator

A new local state `editingEntry: string | null` (or extension of an existing
state shape) marks the row dim while the request is in flight. Visual:
`opacity-50 pointer-events-none` — same treatment used by `removingEntry`.

### Edge Cases

- **Two simultaneous edits across the grid:** prevented by single-entry edit
  state. Trying to open a second editor closes the first.
- **Editing while a drag is active:** disabled. Editor will not open while
  `activeEntry` is set (drag in progress) — clicks fall through to the row.
- **Editing a temp-id entry mid-add:** the row whose `id` starts with `temp-`
  is not yet committed. Skip opening the editor for `temp-` ids; show no
  affordance change. They become editable as soon as the add reconciles to
  the real id.
- **Network error mid-save:** rollback + alert. The editor is closed by then;
  the user sees the entry snap back to its prior value.
- **Empty / invalid input + Enter pressed:** `✓` is disabled; Enter no-ops.
  The user must either type a valid value, click ✗ / press Escape, or click
  away (blur reverts because validation fails).

### Out of Scope (Part 1)

- Editing the underlying recipe / ingredient itself (changing what the entry
  points to). Still requires remove + re-add — different mental model.
- Editing `meal_type` or `day_of_week` via inline edit. Drag-and-drop already
  covers this and an inline editor would duplicate that affordance.
- Bulk multi-entry edits.

---

## Part 2 — Portal Date-Change Feedback

### Problem

In the customer portal at `/portal`, tapping a date in `DayScrubber` or
picking from `CalendarPicker` calls `router.push('/portal?date=…')`, which
triggers a server-component re-render. Until that round-trip completes
(roughly 200–700ms in practice), there is **zero visual feedback**. The
selected pill doesn't change, the cards below don't change, the picker stays
open. Users cannot tell whether their tap registered.

### Goal

Three layered improvements, each addressing a different layer of the lag:

1. **Instant selection acknowledgment** — the new selection visually
   commits the moment the user taps, not when the server replies.
2. **Spatial continuity** — when the new date is near the current one, the
   strip slides to re-center; when far, it snaps. Calendar picks always snap.
3. **Honest fetch state** — while the new day's entries are loading, the
   cards area shows skeleton placeholders, and the calendar (if used) shows
   a spinner on the picked cell until it auto-closes.

### Files Touched

- `components/portal/day-scrubber.tsx`
- `components/portal/calendar-picker.tsx`
- `app/(portal)/portal/today-client.tsx`
- `app/globals.css` — one new `@keyframes` for the tap-pulse

No server-side changes, no new API routes, no schema changes.

### Shared State: `pendingDate`

A single source-of-truth lives in `today-client.tsx`:

```ts
const [pendingDate, setPendingDate] = useState<string | null>(null);

useEffect(() => {
  if (pendingDate && pendingDate === selectedDate) {
    setPendingDate(null);
  }
}, [selectedDate, pendingDate]);
```

`pendingDate` is set by the scrubber or picker the instant a user picks a
date. It is cleared by the `useEffect` when the parent's `selectedDate`
prop catches up — i.e., the new server render has landed.

`pendingDate` and `setPendingDate` are passed down to `DayScrubber` and
`CalendarPicker`. They drive:

- The selected-pill style in the scrubber (`displayDate = pendingDate ?? selectedDate`).
- The skeleton-vs-cards switch in the cards area.
- The picker spinner + auto-close.

### `DayScrubber` — Strip Tap Behavior

Order of effects on tap of date `target`:

1. **Selection snaps.** `setPendingDate(target)` — the selected pill
   re-derives from `pendingDate ?? selectedDate` and emerald-fills the new
   pill on the next render.
2. **Micro-pulse on the tapped pill.** A short CSS animation (`scale(1) →
   scale(1.05) → scale(1)`, ~120ms ease-out). Triggered via a one-shot
   class applied through a per-pill key bump (state counter), so the same
   pill can re-pulse on subsequent taps.
3. **Strip slide (conditional).**
   - Compute `delta = compareLocalDateInDays(target, currentlyShownCenter)`.
   - If `|delta| ≤ 3`: re-center on `target`, mount the new 7-pill window
     with `style={{ transform: translateX(delta * pillWidth) }}`, then on
     next frame transition transform to `0` over 150–200ms ease-out.
   - If `|delta| > 3`: just re-render centered on `target` with no transform
     animation. (Only reachable via repeated chevron presses or programmatic
     state — exotic.)
   - **Calendar-driven changes never slide** — the strip just re-renders.
4. **`router.push`** with the new `?date=`.

### Pill Width Measurement

Slide animation needs a known pill width. Solution:

- Attach a `ref` to one pill (or the strip container) and measure with
  `getBoundingClientRect` on first render via a `useLayoutEffect`. Cache in
  a `useRef`.
- On window resize, re-measure (debounced or on next render — small CSS,
  rare event).
- If the measured width is not yet available on the very first user tap of
  a session, fall back to `containerWidth / 7`. If even that fails (SSR
  timing), skip the slide animation that one time. Acceptable.

### `CalendarPicker` — Pick Behavior

- New local state: `picking: string | null` — the YYYY-MM-DD just picked.
- On cell click:
  1. `setPicking(dateStr)`.
  2. `setPendingDate(dateStr)` (lifted setter passed in as a prop).
  3. `router.push('/portal?date=…')`.
- The clicked cell renders a `Loader2` spinner (animate-spin, emerald, small)
  in place of or beside the date number while `picking` is set.
- All other cells get `pointer-events-none opacity-60` while `picking` is
  set, so a second pick mid-flight is blocked.
- The picker watches the `selectedDate` prop. When `selectedDate === picking`,
  call `onClose()` to dismiss the picker. (Simple `useEffect`.)
- If the picker is dismissed manually (overlay tap / X button) while picking
  is in flight, that's fine — the parent's `pendingDate` will still clear
  itself when the navigation lands.

### `TodayClient` — Cards Skeleton

- Compute `isPending = pendingDate !== null && pendingDate !== selectedDate`.
- Use a 100ms timer to gate skeleton rendering: a fast-completing
  navigation (cache hit, etc.) never flashes skeletons.

```ts
const [showSkeleton, setShowSkeleton] = useState(false);
useEffect(() => {
  if (!isPending) {
    setShowSkeleton(false);
    return;
  }
  const t = setTimeout(() => setShowSkeleton(true), 100);
  return () => clearTimeout(t);
}, [isPending]);
```

- When `showSkeleton`, replace the cards `<div>` with three skeleton blocks:
  rounded-2xl, `animate-pulse`, height matching `MealCard` (~96px), gray-100
  fill. Three blocks regardless of how many entries the previous day had —
  consistent layout.
- The total-kcal line in the page header stays visible (it's small enough to
  not feel stale, and re-rendering it as a skeleton too just adds movement).

### Tap-Pulse CSS

Add to `app/globals.css`:

```css
@keyframes tap-pulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.animate-tap-pulse {
  animation: tap-pulse 120ms ease-out;
}
```

The class is applied via a per-pill key bump:

```ts
const [pulseTick, setPulseTick] = useState<Record<string, number>>({});

function pulse(d: string) {
  setPulseTick((p) => ({ ...p, [d]: (p[d] ?? 0) + 1 }));
}

// in render:
<button key={`${d}-${pulseTick[d] ?? 0}`} className="… animate-tap-pulse">
```

The key change forces React to remount the button, restarting the CSS
animation. (Standard "replay a CSS animation on demand" pattern — no JS
animation lib required.)

### What We're NOT Doing (Part 2)

- No top progress bar (e.g., NProgress) — chose skeleton instead.
- No client-side data fetching layer (SWR, React Query, etc.). Server
  components remain the source of truth.
- No fade-out / fade-in on cards. Skeleton is the transition.
- No animation on first arrival via a direct URL (`?date=` deep link).
  Animations only fire on user-initiated taps within the page.
- No haptic vibration API call (works only on Android, niche).
- No motion on the scrubber strip when shifted via the chevron arrows
  beyond what the existing `shift()` function does. (Adding slide to the
  chevron path is trivial once the slide infrastructure exists for direct
  taps; treat it as a follow-up if it doesn't fall out for free.)

### Edge Cases

- **Rapid taps across the strip.** Each tap resets `pendingDate` to the new
  target. Last tap wins. The slide animation may interrupt a previous
  slide — acceptable visual; React will keep up.
- **Tap the already-selected pill.** No-op: `pendingDate` would equal
  `selectedDate`, the `useEffect` clears it immediately. No slide. No
  pulse — acknowledgment animation only runs when something actually
  changes.
- **Network error / server crash mid-navigation.** `selectedDate` never
  catches up to `pendingDate`. The skeleton stays visible indefinitely.
  Acceptable for the first iteration — subsequent taps reset state. A
  longer-term fix would be a 5–10s timeout that clears `pendingDate` and
  surfaces an error toast. Not in scope here.
- **Tap a strip date and then open the calendar before navigation lands.**
  The picker opens with the original `selectedDate` highlighted (since the
  prop hasn't changed yet) but `pendingDate` is the tapped date. If the
  user then picks a new date, the second pick wins and `pendingDate`
  updates accordingly.
- **Direct URL with `?date=`** — no animation runs because no tap happened.
  The page renders the new date directly.

---

## Implementation Order Recommendation

These two parts are fully independent and can be merged in either order. If
implementing in one session: do **Part 1 first** because it's smaller,
purely client-side state machinery in one file, with no new CSS and no
cross-component data flow. Part 2 touches three components plus a CSS file
and benefits from being its own focused PR.

## Testing Notes

- **Part 1:** edit a recipe portion (e.g., 3 → 5), verify weekly totals
  recompute. Edit an ingredient quantity (200 → 350), verify daily totals
  recompute. Hit blur, hit Enter, hit ✓, hit ✗, hit Escape — each path
  saves or reverts as specced. Try saving an empty value and a zero —
  must reject (✓ disabled). Open editor on entry A, click entry B's value
  — A closes without saving, B opens.
- **Part 2:** tap an adjacent date — snap + pulse + slide visible. Tap a
  date 5 days away via chevrons — snap + pulse, no slide. Calendar pick a
  date 30 days away — picker spinner shows, picker closes when data lands,
  strip re-centers without slide. Throttle network in DevTools to verify
  skeleton actually appears for slow loads, and does not appear for fast
  loads. Tap the same date twice — no-op, no animation.
