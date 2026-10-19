import { parseDecimal } from "@/lib/format";
import { foodEditSchema, type FoodEditInput } from "@/lib/validations/schemas";
import { energyMatchesMacros } from "@/lib/portal/foods";
import type { Food, FoodSource, FoodStatus } from "@/lib/supabase/types";

/** Text-field state of the admin food edit form (decimal comma allowed). */
export interface FoodEditForm {
  name: string;
  brand: string;
  unit: "g" | "ml";
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  sugar: string;
  sat_fat: string;
  salt: string;
  serving_size: string;
  serving_label: string;
}

const str = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

export function foodToEditForm(f: Food): FoodEditForm {
  return {
    name: f.name,
    brand: f.brand ?? "",
    unit: f.unit,
    calories: str(f.calories),
    protein: str(f.protein),
    carbs: str(f.carbs),
    fat: str(f.fat),
    fiber: str(f.fiber),
    sugar: str(f.sugar),
    sat_fat: str(f.sat_fat),
    salt: str(f.salt),
    serving_size: str(f.serving_size),
    serving_label: f.serving_label ?? "",
  };
}

export type FoodEditResult =
  | { ok: true; data: FoodEditInput }
  | { ok: false; errors: Partial<Record<keyof FoodEditForm, string>> };

/** Parses the text fields and validates with `foodEditSchema`; blank optional fields become null. */
export function parseFoodEdit(form: FoodEditForm): FoodEditResult {
  const errors: Partial<Record<keyof FoodEditForm, string>> = {};
  const num = (key: keyof FoodEditForm, required: boolean): number | null => {
    const raw = form[key].trim();
    if (raw === "") {
      if (required) errors[key] = "Required";
      return null;
    }
    const n = parseDecimal(raw);
    if (n === null) {
      errors[key] = "Enter a number";
      return null;
    }
    return n;
  };

  const candidate = {
    name: form.name,
    brand: form.brand.trim() === "" ? null : form.brand,
    unit: form.unit,
    calories: num("calories", true),
    protein: num("protein", true),
    carbs: num("carbs", true),
    fat: num("fat", true),
    fiber: num("fiber", false),
    sugar: num("sugar", false),
    sat_fat: num("sat_fat", false),
    salt: num("salt", false),
    serving_size: num("serving_size", false),
    serving_label: form.serving_label.trim() === "" ? null : form.serving_label,
  };

  const parsed = foodEditSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof FoodEditForm | undefined;
      // Fields flagged above keep their own (more specific) message.
      if (key && !errors[key]) errors[key] = issue.message;
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, data: parsed.data };
}

/** Warning text when kcal and macros disagree (energy ~ 4P + 4C + 9F), else null. */
export function energyHint(
  form: Pick<FoodEditForm, "calories" | "protein" | "carbs" | "fat">
): string | null {
  const kcal = parseDecimal(form.calories);
  const p = parseDecimal(form.protein);
  const c = parseDecimal(form.carbs);
  const f = parseDecimal(form.fat);
  if (kcal === null || p === null || c === null || f === null) return null;
  if (energyMatchesMacros(kcal, p, c, f)) return null;
  const expected = Math.round(4 * p + 4 * c + 9 * f);
  return `Macros add up to about ${expected} kcal, but calories say ${Math.round(kcal)}. Check the values (fibre, alcohol or polyols can explain a gap).`;
}

export interface FoodFilters {
  status: FoodStatus;
  source: FoodSource | "all";
  /** client id, "none" for foods without a creator, or "all" */
  creator: string;
}

export function filterFoods<T extends Pick<Food, "status" | "source" | "created_by_client_id">>(
  foods: T[],
  f: FoodFilters
): T[] {
  return foods.filter((food) => {
    if (food.status !== f.status) return false;
    if (f.source !== "all" && food.source !== f.source) return false;
    if (f.creator === "none") return food.created_by_client_id === null;
    if (f.creator !== "all") return food.created_by_client_id === f.creator;
    return true;
  });
}

export function countByStatus(foods: Pick<Food, "status">[]): Record<FoodStatus, number> {
  const out: Record<FoodStatus, number> = { pending: 0, active: 0, hidden: 0 };
  for (const f of foods) out[f.status] += 1;
  return out;
}
