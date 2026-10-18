"use client";

import { useMemo, useRef, useState } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PrepRule, Ingredient, Category, PrepType } from "@/lib/supabase/types";
import { invalidatePrepRules } from "@/lib/actions/revalidate";
import { useListboxNav } from "@/lib/hooks/use-listbox-nav";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";

const PREP_TYPES: { value: PrepType; label: string }[] = [
  { value: "wash", label: "Wash" },
  { value: "peel", label: "Peel" },
  { value: "chop", label: "Chop" },
  { value: "slice", label: "Slice" },
  { value: "dice", label: "Dice" },
  { value: "marinate", label: "Marinate" },
  { value: "portion", label: "Portion" },
  { value: "thaw", label: "Thaw" },
  { value: "soak", label: "Soak" },
  { value: "blanch", label: "Blanch" },
];

const MAX_SUGGESTIONS = 50;

interface Props {
  rule?: PrepRule;
  ingredients: Ingredient[];
  categories: Category[];
  onClose: () => void;
}

interface FormState {
  mode: "category" | "ingredient";
  ingredient_category: string;
  ingredient_id: string;
  prep_type: string;
  advance_days: number;
  time_estimate_minutes: number | null;
  notes: string;
}

/** Searchable ingredient picker: text filter + listbox, Arrow keys + Enter to select. */
function IngredientCombobox({
  ingredients,
  value,
  onChange,
  inputRef,
  inputId,
  listId,
}: {
  ingredients: Ingredient[];
  value: string;
  onChange: (id: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  inputId: string;
  listId: string;
}) {
  const selected = ingredients.find((i) => i.id === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? ingredients.filter((i) => i.name.toLowerCase().includes(q))
      : ingredients;
    return list.slice(0, MAX_SUGGESTIONS);
  }, [ingredients, query]);

  const nav = useListboxNav({
    count: matches.length,
    onSelect: (i) => select(matches[i]),
    onEscape: () => setOpen(false),
    enabled: open,
    idPrefix: listId,
    listRef,
  });
  const { activeIndex, setActiveIndex } = nav;
  const activeId = open ? nav.activeId : undefined;

  function select(ing: Ingredient) {
    onChange(ing.id);
    setQuery(ing.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        placeholder="Type to search ingredients…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
          if (value) onChange(""); // typing invalidates the previous pick
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          // Revert free text to the chosen ingredient (or clear it if none chosen).
          if (!value) setQuery("");
          else if (selected) setQuery(selected.name);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setOpen(true);
          nav.onKeyDown(e);
        }}
        className={`w-full px-3 py-2 border rounded-lg text-gray-900 text-sm ${value ? "border-emerald-500" : ""}`}
      />
      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-white shadow-lg text-sm"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-gray-500">No ingredients match “{query}”</li>
          ) : (
            matches.map((ing, idx) => (
              <li
                key={ing.id}
                {...nav.getOptionProps(idx)}
                role="option"
                aria-selected={ing.id === value}
                // mousedown (not click) so the input does not blur before selection
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(ing);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`cursor-pointer px-3 py-2 ${
                  idx === activeIndex ? "bg-emerald-50 text-emerald-800" : "text-gray-800"
                } ${ing.id === value ? "font-medium" : ""}`}
              >
                {ing.name}
                {ing.brand ? <span className="text-gray-400"> · {ing.brand}</span> : null}
              </li>
            ))
          )}
          {ingredients.length > MAX_SUGGESTIONS && matches.length === MAX_SUGGESTIONS && (
            <li className="px-3 py-2 text-xs text-gray-400">Keep typing to narrow the list</li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function PrepRuleForm({ rule, ingredients, categories, onClose }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Category is intentionally blank for new rules: the user must pick one explicitly.
  const [initial] = useState<FormState>(() => ({
    mode: rule?.ingredient_id ? "ingredient" : "category",
    ingredient_category: rule?.ingredient_category ?? "",
    ingredient_id: rule?.ingredient_id ?? "",
    prep_type: rule?.prep_type ?? "chop",
    advance_days: rule?.advance_days ?? 1,
    time_estimate_minutes: rule?.time_estimate_minutes ?? null,
    notes: rule?.notes ?? "",
  }));
  const [form, setForm] = useState<FormState>(initial);
  const isDirty = JSON.stringify(form) !== JSON.stringify(initial);

  const categoryRef = useRef<HTMLSelectElement>(null);
  const ingredientRef = useRef<HTMLInputElement>(null);

  async function requestCancel() {
    if (isDirty) {
      const discard = await confirm({
        title: "Discard unsaved changes?",
        message: "Your edits to this prep rule will be lost.",
        confirmLabel: "Discard",
        tone: "danger",
      });
      if (!discard) return;
    }
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.mode === "category" && !form.ingredient_category) {
      setError("Choose a category.");
      categoryRef.current?.focus();
      return;
    }
    if (form.mode === "ingredient" && !form.ingredient_id) {
      setError("Choose an ingredient from the list.");
      ingredientRef.current?.focus();
      return;
    }

    setSaving(true);

    const payload = {
      ingredient_category: form.mode === "category" ? form.ingredient_category : null,
      ingredient_id: form.mode === "ingredient" ? form.ingredient_id || null : null,
      prep_type: form.prep_type,
      advance_days: form.advance_days,
      time_estimate_minutes: form.time_estimate_minutes,
      notes: form.notes || null,
    };

    const result = rule
      ? await supabase.from("prep_rules").update(payload).eq("id", rule.id)
      : await supabase.from("prep_rules").insert(payload);

    if (result.error) {
      setError(result.error.message);
      toast.error(`Could not save prep rule: ${result.error.message}`);
      setSaving(false);
      return;
    }

    toast.success(rule ? "Prep rule updated" : "Prep rule added");
    await invalidatePrepRules();
    router.refresh();
    onClose();
  }

  const fieldClass = "w-full px-3 py-2 border rounded-lg text-gray-900 text-sm";
  const toggleClass = (on: boolean) =>
    `flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
      on ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-500" : "bg-gray-100 text-gray-600 border-2 border-transparent"
    }`;

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? "Edit prep rule" : "Add prep rule"}
      size="md"
      dirty={isDirty}
      initialFocusRef={form.mode === "category" ? categoryRef : ingredientRef}
      footer={
        <>
          <button
            type="button"
            onClick={requestCancel}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="prep-rule-form"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : rule ? "Update rule" : "Add rule"}
          </button>
        </>
      }
    >
      <form id="prep-rule-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
        )}

        <div>
          <span id="prep-rule-apply-label" className="block text-sm font-medium text-gray-700 mb-2">Apply to</span>
          <div className="flex gap-2" role="group" aria-labelledby="prep-rule-apply-label">
            <button
              type="button"
              aria-pressed={form.mode === "category"}
              onClick={() => setForm({ ...form, mode: "category" })}
              className={toggleClass(form.mode === "category")}
            >
              Category
            </button>
            <button
              type="button"
              aria-pressed={form.mode === "ingredient"}
              onClick={() => setForm({ ...form, mode: "ingredient" })}
              className={toggleClass(form.mode === "ingredient")}
            >
              Specific ingredient
            </button>
          </div>
        </div>

        {form.mode === "category" ? (
          <div>
            <label htmlFor="prep-rule-category" className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              id="prep-rule-category"
              ref={categoryRef}
              value={form.ingredient_category}
              onChange={(e) => setForm({ ...form, ingredient_category: e.target.value })}
              className={fieldClass}
            >
              <option value="" disabled>
                {categories.length === 0 ? "No categories yet" : "Choose a category…"}
              </option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label htmlFor="prep-rule-ingredient" className="block text-sm font-medium text-gray-700 mb-1">
              Ingredient
            </label>
            <IngredientCombobox
              ingredients={ingredients}
              value={form.ingredient_id}
              onChange={(id) => setForm({ ...form, ingredient_id: id })}
              inputRef={ingredientRef}
              inputId="prep-rule-ingredient"
              listId="prep-rule-ingredient-list"
            />
          </div>
        )}

        <div>
          <label htmlFor="prep-rule-type" className="block text-sm font-medium text-gray-700 mb-1">Prep type</label>
          <select
            id="prep-rule-type"
            value={form.prep_type}
            onChange={(e) => setForm({ ...form, prep_type: e.target.value })}
            className={fieldClass}
          >
            {PREP_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="prep-rule-days" className="block text-sm font-medium text-gray-700 mb-1">
            Days before cooking
          </label>
          <input
            id="prep-rule-days"
            type="number"
            inputMode="numeric"
            min={0}
            max={6}
            value={form.advance_days}
            onChange={(e) => setForm({ ...form, advance_days: parseInt(e.target.value) || 0 })}
            className={fieldClass}
          />
          <p className="text-xs text-gray-500 mt-1">
            0 = prep on cooking day, 1 = prep the day before, etc.
          </p>
        </div>

        <div>
          <label htmlFor="prep-rule-time" className="block text-sm font-medium text-gray-700 mb-1">
            Time estimate (minutes, optional)
          </label>
          <input
            id="prep-rule-time"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.time_estimate_minutes ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                time_estimate_minutes: e.target.value === "" ? null : parseInt(e.target.value),
              })
            }
            placeholder="Per batch"
            className={fieldClass}
          />
        </div>

        <div>
          <label htmlFor="prep-rule-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes (optional)
          </label>
          <textarea
            id="prep-rule-notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="e.g., Store in airtight container"
            className={`${fieldClass} resize-none`}
          />
        </div>
      </form>
    </Modal>
  );
}
