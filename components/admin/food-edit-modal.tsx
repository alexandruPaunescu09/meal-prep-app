"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { invalidateFoods } from "@/lib/actions/revalidate";
import {
  energyHint,
  foodToEditForm,
  parseFoodEdit,
  type FoodEditForm,
} from "@/lib/admin/food-edit";
import type { Food } from "@/lib/supabase/types";

const INPUT =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

const NUTRIENT_FIELDS: { key: keyof FoodEditForm; label: string }[] = [
  { key: "calories", label: "Calories (kcal)" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
  { key: "fiber", label: "Fiber (g)" },
  { key: "sugar", label: "Sugar (g)" },
  { key: "sat_fat", label: "Sat. fat (g)" },
  { key: "salt", label: "Salt (g)" },
];

/** Edit a shared catalog food: identity, per-100 nutrition and serving size. */
export default function FoodEditModal({
  food,
  onClose,
  onSaved,
}: {
  food: Food;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const initial = useMemo(() => foodToEditForm(food), [food]);
  const [form, setForm] = useState<FoodEditForm>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FoodEditForm, string>>>({});
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const hint = energyHint(form);

  function set<K extends keyof FoodEditForm>(key: K, value: FoodEditForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function save() {
    const parsed = parseFoodEdit(form);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("foods").update(parsed.data).eq("id", food.id);
    if (error) {
      setSaving(false);
      toast.error(`Could not save: ${error.message}`, { action: { label: "Retry", onClick: () => void save() } });
      return;
    }
    await invalidateFoods();
    toast.success("Food updated");
    onSaved();
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit food"
      description="Values are per 100 g or 100 ml. Changing them does not alter past diary entries."
      size="lg"
      dirty={dirty}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            Save
          </button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Name" error={errors.name} className="sm:col-span-2">
            <input className={INPUT} value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Unit" error={errors.unit}>
            <select className={INPUT} value={form.unit} onChange={(e) => set("unit", e.target.value as "g" | "ml")}>
              <option value="g">g</option>
              <option value="ml">ml</option>
            </select>
          </Field>
          <Field label="Brand" error={errors.brand} className="sm:col-span-3">
            <input className={INPUT} value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {NUTRIENT_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} error={errors[f.key]}>
              <input
                className={INPUT}
                inputMode="decimal"
                value={form[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </Field>
          ))}
        </div>
        {hint && (
          <p role="status" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {hint}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Serving size (${form.unit})`} error={errors.serving_size}>
            <input
              className={INPUT}
              inputMode="decimal"
              value={form.serving_size}
              onChange={(e) => set("serving_size", e.target.value)}
            />
          </Field>
          <Field label="Serving label" error={errors.serving_label}>
            <input
              className={INPUT}
              placeholder="e.g. 1 tub"
              value={form.serving_label}
              onChange={(e) => set("serving_label", e.target.value)}
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  error,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
      {error && <span className="block mt-1 text-xs text-red-600">{error}</span>}
    </label>
  );
}
