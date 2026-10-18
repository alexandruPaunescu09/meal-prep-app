"use client";

import { useState } from "react";
import { parseDecimal } from "@/lib/format";
import { MAX_QUICK_KCAL, MAX_QUICK_MACRO, parseOptionalNumber } from "@/lib/portal/diary-draft";

export interface QuickAddValues {
  name: string;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

function Field({
  id,
  label,
  value,
  onChange,
  invalid,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-900 mb-1">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        aria-required={required}
        placeholder={placeholder}
        className="w-full min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
      />
    </div>
  );
}

/** Quick add / quick edit: a name, calories and optional macros, stored only in this diary. */
export default function QuickAddForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };
  submitLabel: string;
  onSubmit: (v: QuickAddValues) => void;
}) {
  const num = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
  const [name, setName] = useState(initial?.name ?? "");
  const [kcal, setKcal] = useState(num(initial?.calories));
  const [protein, setProtein] = useState(num(initial?.protein));
  const [carbs, setCarbs] = useState(num(initial?.carbs));
  const [fat, setFat] = useState(num(initial?.fat));

  const kcalValue = parseDecimal(kcal);
  const kcalOk = kcalValue !== null && kcalValue >= 0 && kcalValue <= MAX_QUICK_KCAL;
  const p = parseOptionalNumber(protein, MAX_QUICK_MACRO);
  const c = parseOptionalNumber(carbs, MAX_QUICK_MACRO);
  const f = parseOptionalNumber(fat, MAX_QUICK_MACRO);
  const macroBad = [p, c, f].some((v) => v !== null && Number.isNaN(v));
  const canSubmit = kcalOk && !macroBad;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit || kcalValue === null) return;
        onSubmit({ name, calories: kcalValue, protein: p, carbs: c, fat: f });
      }}
    >
      <div>
        <label htmlFor="quick-name" className="block text-sm font-medium text-gray-900 mb-1">
          Name <span className="font-normal text-gray-500">(optional)</span>
        </label>
        <input
          id="quick-name"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Coffee with milk"
          className="w-full min-h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"
        />
      </div>
      <Field
        id="quick-kcal"
        label="Calories (kcal)"
        value={kcal}
        onChange={setKcal}
        invalid={kcal.trim() !== "" && !kcalOk}
        placeholder="0 – 5000"
        required
      />
      {kcal.trim() !== "" && !kcalOk && (
        <p className="text-xs text-red-600 -mt-2">Enter calories between 0 and {MAX_QUICK_KCAL}.</p>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Field id="quick-protein" label="Protein g" value={protein} onChange={setProtein} invalid={Number.isNaN(p)} />
        <Field id="quick-carbs" label="Carbs g" value={carbs} onChange={setCarbs} invalid={Number.isNaN(c)} />
        <Field id="quick-fat" label="Fat g" value={fat} onChange={setFat} invalid={Number.isNaN(f)} />
      </div>
      {macroBad && <p className="text-xs text-red-600 -mt-2">Macros must be numbers from 0 to 500.</p>}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full min-h-[48px] rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
