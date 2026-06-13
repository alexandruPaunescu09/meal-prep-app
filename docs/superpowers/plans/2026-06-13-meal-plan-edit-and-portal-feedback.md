# Meal Plan Inline Edit + Portal Date-Change Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline quantity/portion editing to meal plan grid entries, and make customer portal date changes feel instant via snap + pulse + slide + skeleton-loading.

**Architecture:** Two independent feature sets in the same Next.js 16 / React 19 codebase. Part 1 is a self-contained set of state-machine additions inside one file (`app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`). Part 2 lifts a `pendingDate` state into `today-client.tsx` and threads it down to the scrubber and calendar picker, plus a one-shot CSS keyframe in `globals.css`.

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.4, TypeScript strict, Tailwind 4, Supabase (`@supabase/ssr`), `@dnd-kit/core`, lucide-react.

**No test framework exists in this repo.** Verification is via `npm run lint`, `npm run build` (TypeScript + Next compile), and manual browser checks against the running app (`npm run dev`). The spec describes the user-visible behavior to verify; reproduce those exact steps for each task's verification.

**Spec:** `docs/superpowers/specs/2026-06-13-meal-plan-edit-and-portal-feedback-design.md` — read it before starting.

---

## Reference: existing patterns in this repo

When you write code, match the rest of the file. Specifically:

- **Optimistic update pattern** in `meal-plan-grid.tsx` (snapshot → setState → fire mutation → on error rollback + alert + return; on success call `invalidateMealPlan(plan.id)`).
- **Loader spinner**: `import { Loader2 } from "lucide-react"; <Loader2 className="w-4 h-4 animate-spin" />`.
- **Tailwind disabled-while-busy treatment**: `opacity-50 pointer-events-none`.
- **Modal overlay pattern**: `fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4` with the inner card being `bg-white rounded-xl shadow-2xl`.
- **`router.refresh()`** is intentionally avoided after entry mutations (the file's existing comments call this out — only the meta-edit modals call it).

---

# Part 1 — Inline Quantity Editing

Two surfaces share the same write logic but have different editor UIs:
- Desktop grid (`DraggableEntry` component) → inline number input
- Mobile day-stack rows (inside the `md:hidden` block) → small popover

We'll build the shared write function first, then desktop, then mobile.

---

### Task 1.1: Add `updateEntry` write function and editing state

**Files:**
- Modify: `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`

This task is the bedrock the next tasks build on. It introduces:
- `editingEntry` state — id of the entry whose editor is open (null if none).
- `savingEntry` state — id of the entry whose write is in flight (null if none).
- `updateEntry(entryId, patch)` — optimistic write with rollback. `patch` is a partial of `{ portions, quantity }`.

- [ ] **Step 1: Open `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx` and locate the existing state block**

The state block is around lines 82–90. After the `removingEntry` declaration (`const [removingEntry, setRemovingEntry] = useState<string | null>(null);`), add two new state values.

- [ ] **Step 2: Add the new state values**

After `const [removingEntry, setRemovingEntry] = useState<string | null>(null);`, insert:

```tsx
  // editingEntry: id of the entry whose inline editor is currently open
  // (at most one at a time across desktop and mobile). null = no edit open.
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  // savingEntry: id of the entry whose updateEntry write is in flight.
  // Drives the row's dim state. Cleared on success or rollback.
  const [savingEntry, setSavingEntry] = useState<string | null>(null);
```

- [ ] **Step 3: Add the `updateEntry` function**

Place it directly below the existing `addIngredientEntry` function (around line 299). It mirrors the snapshot/optimistic/rollback pattern of `removeEntry`.

```tsx
  async function updateEntry(
    entryId: string,
    patch: { portions?: number; quantity?: number }
  ) {
    // Editor closes immediately; the "saving" dim communicates in-flight.
    setEditingEntry(null);
    const snapshot = entries;
    setSavingEntry(entryId);
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, ...patch } : e))
    );

    const { error } = await supabase
      .from("meal_plan_entries")
      .update(patch)
      .eq("id", entryId);

    setSavingEntry(null);

    if (error) {
      setEntries(snapshot);
      alert(`Update failed: ${error.message}`);
      return;
    }
    // Recipe + ingredient nutrition is already in the in-memory entry, so
    // weekly totals recompute correctly without a refresh. Just bust the
    // cached detail bundle for the next navigation.
    invalidateMealPlan(plan.id);
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run lint`
Expected: no errors. (Unused `setEditingEntry` warnings are fine for now — Task 1.2 uses it.)

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Stage but do not commit (per user request to commit only at the end)**

Skip — user will commit at the end.

---

### Task 1.2: Build the desktop inline editor

**Files:**
- Modify: `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`

The desktop entry is rendered by `DraggableEntry` (around lines 694–749). Its current value display is the `<p className="text-[10px] text-gray-500">` element that shows `×3` or `200g ×1`. We replace that with either the static value or an inline editor depending on whether the entry is being edited.

We need a new presentational component `InlineQuantityEditor` for the editor itself, and we need to extend `DraggableEntry`'s props with the new state + handlers.

- [ ] **Step 1: Add the lucide icons used by the editor**

In the existing `lucide-react` import at the top of the file (line 23), add `Check` if it isn't already imported. Looking at line 23, `Check` is already imported. No change needed.

- [ ] **Step 2: Add the `InlineQuantityEditor` component**

Place it directly above the `DraggableEntry` function (around line 694). This is a self-contained editor used by both the desktop row and the mobile row's popover.

```tsx
function InlineQuantityEditor({
  initialValue,
  kind,
  onSave,
  onCancel,
}: {
  initialValue: number;
  kind: "portions" | "quantity";
  onSave: (value: number) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(String(initialValue));
  // Validation matches SlotPicker exactly: portions step=0.1 min=0.1, quantity step=1 min=1.
  const min = kind === "portions" ? 0.1 : 1;
  const step = kind === "portions" ? "0.1" : "1";
  const parsed = parseFloat(value);
  const valid = !isNaN(parsed) && parsed >= min;

  function commit() {
    if (!valid) {
      onCancel();
      return;
    }
    if (parsed === initialValue) {
      onCancel();
      return;
    }
    onSave(parsed);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        autoFocus
        value={value}
        min={min}
        step={step}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={commit}
        // Stop pointerdown from reaching the draggable wrapper so typing
        // inside the input doesn't initiate a drag.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-14 px-1 py-0 text-[10px] border rounded text-gray-900 text-center focus:ring-1 focus:ring-emerald-500 outline-none"
      />
      <button
        type="button"
        disabled={!valid}
        onClick={(e) => {
          e.stopPropagation();
          commit();
        }}
        className="p-0.5 rounded hover:bg-emerald-100 disabled:opacity-40"
        aria-label="Save"
      >
        <Check className="w-3 h-3 text-emerald-600" />
      </button>
      <button
        type="button"
        // mousedown fires before the input's blur, so the cancel actually
        // cancels rather than letting blur silently commit.
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        }}
        className="p-0.5 rounded hover:bg-red-100"
        aria-label="Cancel"
      >
        <X className="w-3 h-3 text-red-500" />
      </button>
    </span>
  );
}
```

- [ ] **Step 3: Update `DraggableEntry` to accept editor props**

Replace the existing `DraggableEntry` props block:

```tsx
function DraggableEntry({ entry, removingEntry, onRemove, review, status }: { entry: FullEntry; removingEntry: string | null; onRemove: (id: string) => void; review?: MealReview; status?: MealStatus }) {
```

with:

```tsx
function DraggableEntry({
  entry,
  removingEntry,
  savingEntry,
  editingEntry,
  onRemove,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  review,
  status,
}: {
  entry: FullEntry;
  removingEntry: string | null;
  savingEntry: string | null;
  editingEntry: string | null;
  onRemove: (id: string) => void;
  onStartEdit: (id: string) => void;
  onSubmitEdit: (id: string, value: number) => void;
  onCancelEdit: () => void;
  review?: MealReview;
  status?: MealStatus;
}) {
```

- [ ] **Step 4: Update `DraggableEntry`'s body**

The existing body computes `isDragging` and renders a flex row. Update it as follows. Replace the entire function body (from `const { attributes, listeners, setNodeRef, isDragging } = useDraggable(...)` through the closing `</div>` of the row) with:

```tsx
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: entry.id });
  const isEditing = editingEntry === entry.id;
  const isSaving = savingEntry === entry.id;
  // Disable starting an edit on a not-yet-committed row (temp ids).
  const editable = !entry.id.startsWith("temp-");
  const editKind: "portions" | "quantity" = entry.recipe ? "portions" : "quantity";
  const editInitial = entry.recipe ? entry.portions : entry.quantity ?? 0;

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-between bg-emerald-50 rounded px-2 py-1 group transition-opacity ${
        removingEntry === entry.id || isSaving ? "opacity-50 pointer-events-none" : ""
      } ${isDragging ? "opacity-30" : ""}`}
    >
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <button
          {...attributes}
          {...listeners}
          className="p-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity touch-none"
        >
          <GripVertical className="w-3 h-3 text-gray-400" />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-900 truncate flex items-center gap-1">
            {status === "eaten" && (
              <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
            )}
            {status === "skipped" && (
              <MinusCircle className="w-3 h-3 text-gray-400 flex-shrink-0" />
            )}
            <span className="truncate">
              {entry.recipe ? entry.recipe.name : entry.ingredient?.name ?? "Unknown"}
            </span>
            {review && (
              <span className="text-[10px] text-amber-600 flex items-center gap-0.5 flex-shrink-0">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                {review.rating}
              </span>
            )}
          </p>
          {isEditing ? (
            <InlineQuantityEditor
              initialValue={editInitial}
              kind={editKind}
              onSave={(v) => onSubmitEdit(entry.id, v)}
              onCancel={onCancelEdit}
            />
          ) : (
            <button
              type="button"
              disabled={!editable}
              onClick={(e) => {
                e.stopPropagation();
                if (editable) onStartEdit(entry.id);
              }}
              className={`text-[10px] text-gray-500 ${editable ? "hover:text-emerald-700 cursor-text" : "cursor-default"} text-left`}
              title={editable ? "Edit quantity" : undefined}
            >
              {entry.recipe
                ? `×${entry.portions}`
                : `${entry.quantity}g${entry.portions !== 1 ? ` ×${entry.portions}` : ""}`}
            </button>
          )}
        </div>
      </div>
      <button
        onClick={() => onRemove(entry.id)}
        disabled={removingEntry === entry.id}
        className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 transition-opacity"
      >
        {removingEntry === entry.id ? (
          <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
        ) : (
          <X className="w-3 h-3 text-red-500" />
        )}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Update the `DraggableEntry` call site**

In the desktop grid render (around line 484), find:

```tsx
<DraggableEntry key={entry.id} entry={entry} removingEntry={removingEntry} onRemove={removeEntry} review={reviewMap.get(entry.id)} status={statusMap.get(entry.id)} />
```

Replace it with:

```tsx
<DraggableEntry
  key={entry.id}
  entry={entry}
  removingEntry={removingEntry}
  savingEntry={savingEntry}
  editingEntry={editingEntry}
  onRemove={removeEntry}
  onStartEdit={(id) => {
    if (activeEntry) return; // don't open editor mid-drag
    setEditingEntry(id);
  }}
  onSubmitEdit={(id, value) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    if (entry.recipe) {
      updateEntry(id, { portions: value });
    } else {
      updateEntry(id, { quantity: value });
    }
  }}
  onCancelEdit={() => setEditingEntry(null)}
  review={reviewMap.get(entry.id)}
  status={statusMap.get(entry.id)}
/>
```

- [ ] **Step 6: Verify it compiles and lints**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Manual browser verification**

Run: `npm run dev` (if not already running).

Open a meal plan that has at least one recipe entry and one ingredient entry, on a desktop-width viewport.

Verify each of these in turn:

1. Hover an entry — value text (`×3` / `200g`) is hover-highlighted (color shift to emerald-700).
2. Click `×3` on a recipe entry → input appears focused, prefilled with `3`.
3. Type `5`, press Enter → editor closes, row briefly dims (saving), value shows `×5`. Reload the page; value is still `×5`.
4. Click value, type `7`, click ✓ → same result, saves as `×7`.
5. Click value, type `9`, click elsewhere on the page (blur) → saves as `×9`.
6. Click value, type `2`, press Escape → editor closes, value is still `×9`.
7. Click value, type `0`, the ✓ button is disabled, Enter does nothing. Press Escape → reverts.
8. Click the ✗ button after typing `4` → reverts.
9. Click an ingredient entry's `200g` → input prefilled with `200`. Save with Enter → saves correctly. Daily totals row (kcal / P / C / F / Fi) recomputes.
10. Add a new entry; while the spinner is still showing, the value is non-clickable (the cursor stays default). Once the temp id reconciles, it becomes clickable.

If any of these fail, fix and re-verify.

---

### Task 1.3: Build the mobile popover editor

**Files:**
- Modify: `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`

The mobile day-stack rows live inline in the `md:hidden` block (around lines 396–441). They render a static row with the recipe/ingredient name and the value text (`×3` or `200g ×1`). We add tap-to-open-popover behavior.

For mobile the editor UX is a small popover with explicit Save / Cancel buttons (no blur-to-save). For ingredient entries, the popover exposes both `quantity` and `portions` (per the spec). For recipe entries, only `portions`.

- [ ] **Step 1: Add the `MobileQuantityPopover` component**

Place it directly below `InlineQuantityEditor` (which you added in Task 1.2 Step 2). This is a small modal/popover anchored visually as a centered modal — the existing mobile row is short and a centered modal is the simplest reliable layout that doesn't get clipped by `overflow-hidden` parents.

```tsx
function MobileQuantityPopover({
  entry,
  onSave,
  onCancel,
}: {
  entry: FullEntry;
  onSave: (patch: { portions?: number; quantity?: number }) => void;
  onCancel: () => void;
}) {
  const isRecipe = !!entry.recipe;
  const [portions, setPortions] = useState(String(entry.portions ?? 1));
  const [quantity, setQuantity] = useState(
    entry.quantity != null ? String(entry.quantity) : "0"
  );
  const portionsNum = parseFloat(portions);
  const quantityNum = parseFloat(quantity);
  const portionsValid = !isNaN(portionsNum) && portionsNum >= 0.1;
  const quantityValid = !isNaN(quantityNum) && quantityNum >= 1;
  const valid = isRecipe
    ? portionsValid
    : portionsValid && quantityValid;
  const title = isRecipe
    ? entry.recipe?.name ?? "Recipe"
    : entry.ingredient?.name ?? "Ingredient";

  function submit() {
    if (!valid) return;
    if (isRecipe) {
      if (portionsNum === entry.portions) {
        onCancel();
        return;
      }
      onSave({ portions: portionsNum });
    } else {
      const qChanged = quantityNum !== entry.quantity;
      const pChanged = portionsNum !== entry.portions;
      if (!qChanged && !pChanged) {
        onCancel();
        return;
      }
      const patch: { portions?: number; quantity?: number } = {};
      if (qChanged) patch.quantity = quantityNum;
      if (pChanged) patch.portions = portionsNum;
      onSave(patch);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            Edit {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {!isRecipe && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Quantity (g)
              </label>
              <input
                type="number"
                min={1}
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                autoFocus
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Portions</label>
            <input
              type="number"
              min={0.1}
              step="0.1"
              value={portions}
              onChange={(e) => setPortions(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
              autoFocus={isRecipe}
            />
          </div>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 px-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!valid}
            className="flex-1 py-2 px-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Make mobile rows tappable to open the popover**

The mobile row is the `<div>` at the top of the inner `slotEntries.map((entry) => { ... })` rendering inside the `md:hidden` block (around lines 400–440). Find this block:

```tsx
                            <div
                              key={entry.id}
                              className={`flex items-center justify-between bg-emerald-50 rounded px-2 py-1 transition-opacity ${removingEntry === entry.id ? "opacity-50 pointer-events-none" : ""}`}
                            >
```

and update to (note the new `onClick`, `role`, expanded dim condition, and avoid opening the editor for temp ids):

```tsx
                            <div
                              key={entry.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (entry.id.startsWith("temp-")) return;
                                if (savingEntry === entry.id) return;
                                setEditingEntry(entry.id);
                              }}
                              className={`flex items-center justify-between bg-emerald-50 rounded px-2 py-1 transition-opacity ${
                                removingEntry === entry.id || savingEntry === entry.id
                                  ? "opacity-50 pointer-events-none"
                                  : ""
                              }`}
                            >
```

- [ ] **Step 3: Stop the X (delete) button from triggering the row's onClick**

In the same mobile row, find the existing remove button:

```tsx
                              <button
                                onClick={() => removeEntry(entry.id)}
```

Update its onClick to stop propagation (so deleting doesn't also open the popover):

```tsx
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeEntry(entry.id);
                                }}
```

- [ ] **Step 4: Render the popover when an entry is being edited**

At the bottom of the main component's JSX, after the `{showDelivery && plan.client_id && ...}` block but still inside the outer `<div>` (around line 675), add the popover render. Note: only render on mobile widths so the desktop inline editor remains the desktop UX. Tailwind's `md:hidden` ensures this.

```tsx
      {/* Mobile quantity-edit popover (mobile only — desktop uses inline editor) */}
      {editingEntry && (() => {
        const e = entries.find((x) => x.id === editingEntry);
        if (!e) return null;
        return (
          <div className="md:hidden">
            <MobileQuantityPopover
              entry={e}
              onSave={(patch) => updateEntry(editingEntry, patch)}
              onCancel={() => setEditingEntry(null)}
            />
          </div>
        );
      })()}
```

Note: the desktop `DraggableEntry` opens its inline editor via `editingEntry === entry.id` and closes itself when that no longer holds — the mobile popover above is gated by `md:hidden` on its wrapper, so on desktop it never renders even if `editingEntry` is set (and the desktop editor is already showing). This is intentional.

One subtlety: a user resizing from desktop → mobile mid-edit would see both editors briefly. This is exotic and self-resolves on the next `setEditingEntry(null)`. Not worth special-casing.

- [ ] **Step 5: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual browser verification (mobile width)**

Run `npm run dev` if not running. Open the meal plan in a narrow viewport (Chrome DevTools device toolbar, iPhone 14 preset).

1. Tap a recipe row → popover opens with portions field prefilled and focused, ingredient quantity field is hidden.
2. Change portions, tap Save → popover closes, row dims briefly, new value shows.
3. Tap an ingredient row → popover opens with both Quantity and Portions fields. Quantity is autofocused.
4. Change Quantity only, tap Save → saves quantity only.
5. Change both Quantity and Portions, tap Save → both save.
6. Open popover, tap Cancel → no change.
7. Open popover, tap the dark overlay → no change (overlay closes the popover via `onClick={onCancel}`).
8. Open popover, set quantity to 0 → Save button disabled.
9. Tap the X (delete) button on a row → row deletes, popover does NOT open (propagation stopped).
10. Add a new entry; while it shows the temp spinner, tapping the row does nothing.
11. Resize the viewport to desktop — desktop inline editor works as before.

If any of these fail, fix and re-verify.

---

# Part 2 — Portal Date-Change Feedback

We add a `pendingDate` state in `today-client.tsx` that flows down to the scrubber and picker. The scrubber gets snap + pulse + slide; the picker gets a spinner; the cards area gets skeletons (gated by 100ms).

Build order: shared state first, then scrubber feedback, then picker feedback, then cards skeleton. Each task is verifiable on its own.

---

### Task 2.1: Add the tap-pulse keyframe to globals.css

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Open `app/globals.css`**

The file currently has Tailwind import + autofill rules. We append a keyframe and a utility class.

- [ ] **Step 2: Append the tap-pulse rule at the bottom of the file**

```css

/* Tap-pulse: applied to a pill in DayScrubber on tap to give immediate
 * tactile acknowledgment. Animation restarts via key bump on the element. */
@keyframes tap-pulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.animate-tap-pulse {
  animation: tap-pulse 120ms ease-out;
}
```

- [ ] **Step 3: Verify the build still works**

Run: `npm run build`
Expected: builds, CSS compiles.

---

### Task 2.2: Lift `pendingDate` into `today-client.tsx`

**Files:**
- Modify: `app/(portal)/portal/today-client.tsx`

This task wires the state but doesn't yet add the visual effects. It threads a `pendingDate` value + setter through to `DayScrubber`. Existing behavior must continue to work — picking via `router.push` is what makes the new prop arrive.

- [ ] **Step 1: Import `useEffect` and add the state**

At the top of the file, the existing import is:

```tsx
import { useMemo, useState } from "react";
```

Update to:

```tsx
import { useEffect, useMemo, useState } from "react";
```

Inside the component, near the other `useState` (after `const [openEntryId, setOpenEntryId] = useState<string | null>(null);`), add:

```tsx
  // pendingDate: the date the user has tapped/picked but for which the
  // server-rendered prop hasn't caught up yet. Drives the scrubber's
  // selected-pill style, the calendar's spinner, and the cards-area
  // skeleton. Cleared by the effect below when selectedDate matches.
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  useEffect(() => {
    if (pendingDate && pendingDate === selectedDate) {
      setPendingDate(null);
    }
  }, [selectedDate, pendingDate]);
```

- [ ] **Step 2: Pass `pendingDate` and `setPendingDate` down to `DayScrubber`**

Find the existing scrubber usage:

```tsx
      <DayScrubber
        selectedDate={selectedDate}
        todayDate={todayDate}
        planDates={planDateSet}
      />
```

Replace with:

```tsx
      <DayScrubber
        selectedDate={selectedDate}
        todayDate={todayDate}
        planDates={planDateSet}
        pendingDate={pendingDate}
        onPendingChange={setPendingDate}
      />
```

`DayScrubber` will accept the new props in Task 2.3 (the build will fail at this point — that's expected, the next task fixes it).

- [ ] **Step 3: Skip lint/build verification until Task 2.3**

The intermediate state has a prop type mismatch. Continue immediately to the next task.

---

### Task 2.3: Add snap + pulse + slide to `DayScrubber`

**Files:**
- Modify: `components/portal/day-scrubber.tsx`

- [ ] **Step 1: Update the imports**

Replace:

```tsx
import { useMemo, useState } from "react";
```

with:

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: Extend the `Props` interface**

Replace:

```tsx
interface Props {
  /** YYYY-MM-DD currently shown. Drives the strip's centering. */
  selectedDate: string;
  /** YYYY-MM-DD of today (server-provided so it matches the page render). */
  todayDate: string;
  /** All YYYY-MM-DD strings the customer has a plan covering. */
  planDates: Set<string>;
}
```

with:

```tsx
interface Props {
  /** YYYY-MM-DD currently shown. Drives the strip's centering. */
  selectedDate: string;
  /** YYYY-MM-DD of today (server-provided so it matches the page render). */
  todayDate: string;
  /** All YYYY-MM-DD strings the customer has a plan covering. */
  planDates: Set<string>;
  /** YYYY-MM-DD the user just picked, before the server catches up. */
  pendingDate: string | null;
  /** Setter for pendingDate (lifted into the parent today-client). */
  onPendingChange: (d: string | null) => void;
}
```

- [ ] **Step 3: Update the component signature to accept the new props**

Replace:

```tsx
export default function DayScrubber({
  selectedDate,
  todayDate,
  planDates,
}: Props) {
```

with:

```tsx
export default function DayScrubber({
  selectedDate,
  todayDate,
  planDates,
  pendingDate,
  onPendingChange,
}: Props) {
```

- [ ] **Step 4: Compute `displayDate` from pending vs selected**

Right after the destructure, add:

```tsx
  // displayDate drives the visual selection (so taps feel instant).
  // selectedDate stays the source of truth for the URL/data.
  const displayDate = pendingDate ?? selectedDate;
```

Then update the `useMemo` for `days` to depend on `displayDate` instead of `selectedDate`:

```tsx
  // Window of 7 dates centered on displayDate (offset -3..+3).
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDaysLocal(displayDate, i - 3));
  }, [displayDate]);
```

And update the header label and the "isSelected" comparison further down to use `displayDate`:

```tsx
  const selectedLabel = formatHeader(displayDate, todayDate);
```

In the day-pill render loop, change:

```tsx
              const isSelected = compareLocalDate(d, selectedDate) === 0;
```

to:

```tsx
              const isSelected = compareLocalDate(d, displayDate) === 0;
```

- [ ] **Step 5: Add pill-width measurement state**

Add inside the component, after `const [calendarOpen, setCalendarOpen] = useState(false);`:

```tsx
  const stripRef = useRef<HTMLDivElement | null>(null);
  const pillWidthRef = useRef<number>(0);

  useLayoutEffect(() => {
    function measure() {
      const el = stripRef.current;
      if (!el) return;
      // The 7-pill grid lives inside the ref'd container with `gap-1`
      // (4px). Width = (clientWidth − 6 gaps) / 7.
      const gap = 4;
      const w = (el.clientWidth - gap * 6) / 7;
      if (w > 0) pillWidthRef.current = w;
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
```

- [ ] **Step 6: Add slide + pulse state**

Add directly below the pill-width refs:

```tsx
  // slideOffsetPx: applied as translateX to the strip once on mount of a
  // new window, then animated back to 0. 0 = no slide animation pending.
  const [slideOffsetPx, setSlideOffsetPx] = useState(0);
  // pulseTick: per-date counter; bumping it forces the pill to remount
  // and replay the CSS animation.
  const [pulseTick, setPulseTick] = useState<Record<string, number>>({});
  // The date currently mid-slide (anchor to compare deltas against on
  // rapid taps). Otherwise rapid taps stack offsets weirdly.
  const slideAnchorRef = useRef<string>(displayDate);
```

- [ ] **Step 7: Replace the `navigate` and `shift` functions with the snap-pulse-slide variant**

Replace the existing block:

```tsx
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
```

with:

```tsx
  // Snap-pulse-slide tap on a strip pill. `from` is the date that was the
  // visible center before this tap (used to compute slide delta).
  function tapStripDate(target: string) {
    const from = slideAnchorRef.current;
    if (target === from) return; // tapping the already-selected pill: no-op

    // 1. snap selection visually
    onPendingChange(target);

    // 2. micro-pulse on the tapped pill
    setPulseTick((p) => ({ ...p, [target]: (p[target] ?? 0) + 1 }));

    // 3. slide the strip if delta within ±3
    const delta = daysBetween(from, target);
    if (Math.abs(delta) <= 3 && pillWidthRef.current > 0) {
      // The new window is centered on `target`. Render it pre-shifted by
      // `delta * pillWidth` (so visually it starts where the old window
      // was), then transition transform to 0.
      const offset = delta * (pillWidthRef.current + 4); // gap = 4px
      setSlideOffsetPx(offset);
      // next frame: animate to 0
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setSlideOffsetPx(0));
      });
    } else {
      setSlideOffsetPx(0);
    }
    slideAnchorRef.current = target;

    // 4. fire navigation
    router.push(`/portal?date=${target}`);
  }

  function shift(delta: number) {
    tapStripDate(addDaysLocal(displayDate, delta));
  }

  function pickFromCalendar(dateStr: string) {
    // Calendar picks: snap + pending + navigate, but no slide. Picker
    // closes itself via its own selectedDate-prop watcher (Task 2.4).
    onPendingChange(dateStr);
    slideAnchorRef.current = dateStr;
    setSlideOffsetPx(0);
    router.push(`/portal?date=${dateStr}`);
  }

  // Reset the slide anchor whenever the prop catches up — keeps daysBetween
  // sane for the next user interaction.
  useEffect(() => {
    slideAnchorRef.current = selectedDate;
  }, [selectedDate]);
```

- [ ] **Step 8: Add the `daysBetween` helper at the bottom of the file**

After the `formatHeader` function (which is at the bottom of the file), add:

```tsx
function daysBetween(a: string, b: string): number {
  // Both YYYY-MM-DD. Convert to local Date midnight, diff in days.
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}
```

- [ ] **Step 9: Wire the strip ref + transform style + per-pill key bump**

Find the existing strip wrapper:

```tsx
          <div className="flex-1 grid grid-cols-7 gap-1">
            {days.map((d) => {
```

Replace with:

```tsx
          <div
            ref={stripRef}
            className="flex-1 grid grid-cols-7 gap-1"
            style={{
              transform: `translateX(${slideOffsetPx}px)`,
              transition:
                slideOffsetPx === 0 ? "transform 180ms ease-out" : "none",
            }}
          >
            {days.map((d) => {
```

Inside the map, find the existing `<button>` element returned for each pill. Replace its key + onClick:

```tsx
                <button
                  key={d}
                  type="button"
                  onClick={() => navigate(d)}
                  className={`${base} ${stateClass}`}
                >
```

with:

```tsx
                <button
                  key={`${d}-${pulseTick[d] ?? 0}`}
                  type="button"
                  onClick={() => tapStripDate(d)}
                  className={`${base} ${stateClass} animate-tap-pulse`}
                >
```

The `key` change forces React to remount the button on each tap (the CSS animation replays from the start). The `animate-tap-pulse` class is always present, but only triggers on mount, so it fires exactly once per tap.

One nuance: the initial render also has `animate-tap-pulse` on every pill, meaning every pill briefly pulses on first mount. The animation is 120ms and the change is small (1.0 → 1.05 → 1.0); first-mount pulse is acceptable. If it ever feels distracting we can gate the class on `pulseTick[d] !== undefined`, but keep it simple for v1.

- [ ] **Step 10: Update chevron-button onClicks**

The two chevron buttons currently call `shift(-1)` and `shift(1)`. They already use `shift`, which now tracks pending state correctly. No code change needed, but verify they still call `shift(-1)` / `shift(1)`.

- [ ] **Step 11: Verify it compiles and the prop wiring matches Task 2.2**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: builds. (If the props mismatch from Task 2.2 surfaced before, it's resolved now.)

- [ ] **Step 12: Manual browser verification**

Run `npm run dev` if not running. Open `/portal` (logged in as a customer with at least one plan covering recent dates).

1. Tap a date one off from today → selected pill snaps immediately, pulses briefly, strip slides toward the new center over ~180ms.
2. Tap a date 3 off from today → same: snap, pulse, slide over ~180ms.
3. Mash the right chevron 5 times rapidly → each tap pulses + slides; rapid sequence is smooth-ish (slides may interrupt — fine).
4. Throttle network in DevTools to "Slow 3G". Tap an adjacent date → pill snaps and pulses immediately, strip slides immediately, then several hundred ms later the cards update. (No skeleton yet — that's Task 2.5.)
5. Tap the already-selected pill → no animation, no navigation.
6. Reload at `?date=2026-06-10` → strip renders centered without animation. (No animation on direct loads since no tap occurred.)

If any fail, fix and re-verify.

---

### Task 2.4: Add picker spinner + auto-close

**Files:**
- Modify: `components/portal/calendar-picker.tsx`

The picker currently fires `onPick(c.dateStr)` and the parent (DayScrubber's `pickFromCalendar`) closes it. We want the picker to stay open with a spinner until the parent's `selectedDate` prop transitions to the picked date, then close itself.

This requires the parent to NOT call `onClose` synchronously. Currently in DayScrubber:

```tsx
function pickFromCalendar(dateStr: string) {
  setCalendarOpen(false);
  navigate(dateStr);
}
```

Wait — Task 2.3 already replaced this. The new version is:

```tsx
function pickFromCalendar(dateStr: string) {
  onPendingChange(dateStr);
  slideAnchorRef.current = dateStr;
  setSlideOffsetPx(0);
  router.push(`/portal?date=${dateStr}`);
}
```

It no longer calls `setCalendarOpen(false)`. Good. The picker is responsible for closing itself. Now wire that up.

- [ ] **Step 1: Add `Loader2` to picker imports**

In `components/portal/calendar-picker.tsx`, replace:

```tsx
import { ChevronLeft, ChevronRight, X } from "lucide-react";
```

with:

```tsx
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
```

- [ ] **Step 2: Add `picking` local state and an effect to auto-close**

Inside the component body, after the existing `useState` for view month/year, add:

```tsx
  // The date the user just clicked, while we wait for the parent's
  // selectedDate prop to catch up. Used to render a spinner on that
  // cell and to disable other cells.
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    // When the parent's selectedDate matches what we picked, the
    // navigation has landed — close the picker.
    if (picking && compareLocalDate(selectedDate, picking) === 0) {
      onClose();
    }
  }, [selectedDate, picking, onClose]);
```

- [ ] **Step 3: Update the cell `onClick` to set picking and call `onPick`**

Find the existing `<button>` rendered for each cell:

```tsx
                <button
                  key={c.dateStr}
                  type="button"
                  onClick={() => onPick(c.dateStr)}
                  className={`${base} ${stateClass} ${dimMonth}`}
                >
                  {c.date.getDate()}
                </button>
```

Replace with:

```tsx
                <button
                  key={c.dateStr}
                  type="button"
                  disabled={picking !== null}
                  onClick={() => {
                    setPicking(c.dateStr);
                    onPick(c.dateStr);
                  }}
                  className={`${base} ${stateClass} ${dimMonth} ${
                    picking !== null && picking !== c.dateStr
                      ? "pointer-events-none opacity-60"
                      : ""
                  }`}
                >
                  {picking === c.dateStr ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    c.date.getDate()
                  )}
                </button>
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: builds.

- [ ] **Step 5: Manual browser verification**

Open `/portal`, tap the Calendar button to open the picker.

1. Click a date in the visible month → that cell shows a spinner; other cells dim and are non-interactive; picker stays open until the page re-renders, then closes.
2. With network throttled to "Slow 3G", open the picker, click a date → spinner is clearly visible for 1–3s, then picker closes once data lands.
3. Open picker, click a date 30 days away → spinner shows, picker closes when ready, strip is re-centered without slide animation.
4. Open picker, then close it manually (overlay tap or X button) without picking → no spinner visible, picker dismisses.
5. Open picker, click a date, immediately try clicking another date → second click is blocked.

If any fail, fix and re-verify.

---

### Task 2.5: Add cards-area skeleton

**Files:**
- Modify: `app/(portal)/portal/today-client.tsx`

While `pendingDate !== null` AND `pendingDate !== selectedDate`, after a 100ms gate, replace the cards section with three skeleton blocks. Cards return as soon as `pendingDate` clears (Task 2.2 effect handles that).

- [ ] **Step 1: Add the skeleton-gate state and effect**

In `today-client.tsx`, the `pendingDate` state was added in Task 2.2. Below the existing `useEffect` that clears `pendingDate`, add:

```tsx
  // A 100ms gate — fast loads (cache hit, etc.) never flash skeletons.
  // showSkeleton becomes true only if the navigation is still in-flight
  // 100ms after the user's tap.
  const isPending = pendingDate !== null && pendingDate !== selectedDate;
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

- [ ] **Step 2: Render skeletons in place of cards when active**

Find the existing block that conditionally renders the empty-state or the cards:

```tsx
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
```

Replace with:

```tsx
      {showSkeleton ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-gray-100 rounded-2xl border border-gray-200 h-24 animate-pulse"
            />
          ))}
        </div>
      ) : cards.length === 0 ? (
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: no errors.

Run: `npm run build`
Expected: builds.

- [ ] **Step 4: Manual browser verification**

1. Open `/portal` with throttling set to "Slow 3G".
2. Tap an adjacent date → strip snaps + pulses + slides immediately. Cards stay visible briefly, then 100ms later swap to three pulsing gray skeleton blocks. When data lands, the new day's cards appear.
3. With throttling off (fast network), tap a date → no skeleton flash; cards swap directly. (The 100ms gate prevents the flash on fast loads.)
4. Open the calendar picker, throttled. Pick a date → picker spinner visible, scrubber still showing old date highlighted. Once data lands, picker closes and cards update.
5. Tap the already-selected pill → no skeleton appears, no spinner, no animation.

If any fail, fix and re-verify.

---

### Task 2.6: End-to-end smoke

**Files:**
- All of Part 2 working together.

- [ ] **Step 1: Run the full suite of verifications from Tasks 2.3, 2.4, 2.5 in one session**

Do all of the following on a single run of the dev server, in one continuous browsing session:

1. Open `/portal`.
2. Tap each pill in the strip in turn → snap, pulse, slide each time. Cards update.
3. Mash both chevrons rapidly → animations chain smoothly.
4. Open the calendar picker → click a far-away date → spinner visible, picker auto-closes, strip re-centers without slide.
5. Tap an adjacent strip date → snap + pulse + slide.
6. With throttling ON: tap an adjacent date → after 100ms, skeleton appears in the cards area. Data lands; cards update.
7. Same but for a calendar pick.
8. Tap an already-selected date → no animation, no skeleton, no navigation.
9. Resize the window mid-interaction → pill width re-measures (try sliding after a resize: still works).
10. Reload page at `?date=2026-06-10` → renders without animation.

- [ ] **Step 2: Run lint + build one final time**

Run: `npm run lint && npm run build`
Expected: both succeed cleanly.

---

# Final verification (both parts)

- [ ] **Step 1: Re-run lint + build**

```
npm run lint
npm run build
```

Expected: both pass.

- [ ] **Step 2: Smoke-test Part 1 once more**

On a meal-plan page, edit a recipe entry's portions and an ingredient entry's quantity, both desktop and mobile, both Save and Cancel paths, both Enter/blur and ✓-button paths.

- [ ] **Step 3: Smoke-test Part 2 once more**

On `/portal`, tap dates, mash chevrons, use the calendar picker, throttle the network, verify skeletons appear only on slow loads.

- [ ] **Step 4: Update CLAUDE.md changelog**

Add a row at the bottom of the Changelog table in `CLAUDE.md`. Match the existing format. Use today's date `2026-06-13`.

```markdown
| 2026-06-13 | Meal-plan inline quantity edit (click value text on desktop, tap row on mobile → small popover/inline editor with Save/Cancel/Enter/Esc/blur) + portal date-change feedback (instant pill snap, micro-pulse, ±3 day strip slide, calendar-picker spinner, 100ms-gated cards skeleton) | `app/(authenticated)/meal-plans/[id]/meal-plan-grid.tsx`, `app/(portal)/portal/today-client.tsx`, `components/portal/day-scrubber.tsx`, `components/portal/calendar-picker.tsx`, `app/globals.css` |
```

- [ ] **Step 5: Hand back to user for commit**

Per user's standing instruction, do not commit. Inform them the work is complete and ready for review.

---

## Self-review notes (already addressed)

- Spec coverage:
  - Part 1: triggers (desktop click, mobile tap) ✓; editor controls (✓/✗/Enter/Esc/blur, mousedown for cancel) ✓; validation (min/step matching SlotPicker) ✓; optimistic save with rollback + alert ✓; row dim while saving ✓; temp-id guard ✓; drag guard ✓; mobile popover with quantity+portions for ingredients ✓.
  - Part 2: pendingDate single source of truth ✓; snap+pulse+slide(±3) ✓; chevron uses same path ✓; calendar pick spinner + auto-close ✓; 100ms-gated skeleton ✓; CSS keyframe ✓.
- No placeholders. All code is concrete; no "implement validation here" comments.
- Type consistency: `updateEntry` takes `{ portions?, quantity? }`. Callers always pass at least one.
- Cross-task references named consistently: `editingEntry` / `savingEntry` / `pendingDate` / `displayDate` / `picking` / `showSkeleton`.
