import { validatePer100 } from "@/lib/portal/foods";
import { getNutrient } from "@/lib/nutrition/nutrients";

/**
 * Pure mapping from what the model READ off a nutrition label to a per-100 g/ml draft for the shared
 * `foods` catalog (FD-5). No I/O. The model only transcribes; every conversion (per-serving to
 * per-100, kJ to kcal, sodium to salt, micronutrient units) happens here so it is testable.
 */

export const LABEL_MICROS = [
  "vitamin_a",
  "vitamin_d",
  "vitamin_e",
  "vitamin_k",
  "vitamin_c",
  "folate",
  "vitamin_b12",
  "potassium",
  "calcium",
  "phosphorus",
  "magnesium",
  "iron",
  "zinc",
  "selenium",
] as const;
export type LabelMicro = (typeof LABEL_MICROS)[number];

/** Our stored key and unit for each micronutrient the label reader may report. */
const MICRO_TARGET: Record<LabelMicro, { key: string; unit: "mg" | "ug" }> = {
  vitamin_a: { key: "vitamin_a_ug", unit: "ug" },
  vitamin_d: { key: "vitamin_d_ug", unit: "ug" },
  vitamin_e: { key: "vitamin_e_mg", unit: "mg" },
  vitamin_k: { key: "vitamin_k_ug", unit: "ug" },
  vitamin_c: { key: "vitamin_c_mg", unit: "mg" },
  folate: { key: "folate_ug", unit: "ug" },
  vitamin_b12: { key: "vitamin_b12_ug", unit: "ug" },
  potassium: { key: "potassium_mg", unit: "mg" },
  calcium: { key: "calcium_mg", unit: "mg" },
  phosphorus: { key: "phosphorus_mg", unit: "mg" },
  magnesium: { key: "magnesium_mg", unit: "mg" },
  iron: { key: "iron_mg", unit: "mg" },
  zinc: { key: "zinc_mg", unit: "mg" },
  selenium: { key: "selenium_ug", unit: "ug" },
};

/** Micrograms per printed unit; mg values are converted through grams. */
const TO_UG = { g: 1e6, mg: 1e3, ug: 1 } as const;
export type LabelUnit = keyof typeof TO_UG;

/** What the model transcribes. Every number is exactly as printed, for the printed basis. */
export interface RawLabel {
  readable: boolean;
  unreadable_reason: string | null;
  name: string | null;
  brand: string | null;
  /** Unit of the basis column: grams for solids, millilitres for drinks. */
  unit: "g" | "ml" | null;
  /** Amount of g/ml the printed values refer to: 100 for a "per 100 g" column, the serving for "per serving". */
  basis_amount: number | null;
  serving_size: number | null;
  serving_label: string | null;
  package_size: number | null;
  energy_kcal: number | null;
  energy_kj: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sat_fat: number | null;
  salt_g: number | null;
  sodium: number | null;
  sodium_unit: "g" | "mg" | null;
  micros: { nutrient: LabelMicro; amount: number; unit: LabelUnit }[];
}

export interface LabelDraft {
  name: string;
  brand: string | null;
  unit: "g" | "ml";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  sugar: number | null;
  sat_fat: number | null;
  salt: number | null;
  micronutrients: Record<string, number>;
  serving_size: number | null;
  serving_label: string | null;
  package_size: number | null;
}

export type LabelMapResult =
  | { ok: true; draft: LabelDraft }
  | { ok: false; reason: "unreadable" | "implausible"; message: string };

const KJ_PER_KCAL = 4.184;
const SALT_PER_SODIUM = 2.5;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const nonNeg = (v: unknown): v is number => finite(v) && v >= 0;
const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const scale = (v: number | null, factor: number): number | null => (nonNeg(v) ? round(v * factor) : null);
const positive = (v: number | null): number | null => (finite(v) && v > 0 ? v : null);

const UNREADABLE = (message: string): LabelMapResult => ({ ok: false, reason: "unreadable", message });

export function mapLabel(raw: RawLabel): LabelMapResult {
  if (!raw.readable) {
    return UNREADABLE(raw.unreadable_reason?.trim() || "We couldn't read a nutrition table in this photo.");
  }
  const name = raw.name?.trim().slice(0, 120);
  if (!name) return UNREADABLE("We couldn't read the product name. Include the front of the pack or the full label.");
  if (!raw.unit) return UNREADABLE("We couldn't tell whether the values are per 100 g or per 100 ml.");
  const basis = positive(raw.basis_amount);
  if (basis === null) return UNREADABLE("We couldn't tell what amount the nutrition values refer to.");
  const factor = 100 / basis;

  // Energy: kcal as printed, else kJ / 4.184.
  const kcalPrinted = nonNeg(raw.energy_kcal) ? raw.energy_kcal : null;
  const kcal = kcalPrinted ?? (nonNeg(raw.energy_kj) ? raw.energy_kj / KJ_PER_KCAL : null);
  if (kcal === null) return UNREADABLE("We couldn't find the energy (kcal or kJ) on the label.");

  // Salt: as printed, else sodium x 2.5.
  let saltPrinted: number | null = nonNeg(raw.salt_g) ? raw.salt_g : null;
  if (saltPrinted === null && nonNeg(raw.sodium)) {
    const sodiumG = raw.sodium_unit === "mg" ? raw.sodium / 1000 : raw.sodium;
    saltPrinted = sodiumG * SALT_PER_SODIUM;
  }

  const macros = validatePer100({
    calories: scale(kcal, factor),
    protein: scale(raw.protein, factor),
    carbs: scale(raw.carbs, factor),
    fat: scale(raw.fat, factor),
    fiber: scale(raw.fiber, factor),
    sugar: scale(raw.sugar, factor),
    sat_fat: scale(raw.sat_fat, factor),
    salt: scale(saltPrinted, factor),
  });
  if (!macros || macros.calories === null || macros.protein === null || macros.carbs === null || macros.fat === null) {
    return {
      ok: false,
      reason: "implausible",
      message: "The values we read don't add up (energy doesn't match protein, carbs and fat). Retake the photo, sharper and straight-on.",
    };
  }

  // Micronutrients: only with a stated unit, converted to our key and unit, per 100. First reading wins.
  const micronutrients: Record<string, number> = {};
  for (const m of raw.micros ?? []) {
    const target = MICRO_TARGET[m.nutrient];
    const perUg = TO_UG[m.unit];
    if (!target || !perUg || !(m.amount > 0) || !finite(m.amount) || target.key in micronutrients) continue;
    const per100Ug = m.amount * perUg * factor;
    const value = round(target.unit === "mg" ? per100Ug / 1e3 : per100Ug, 3);
    const ref = getNutrient(target.key).reference;
    // A value more than 100x the daily reference per 100 g is a misread unit, not a food.
    if (value > 0 && (ref === null || value <= ref * 100)) micronutrients[target.key] = value;
  }

  // The serving is stored in g/ml as printed. A serving that is not smaller than 10 kg is a misread.
  const serving = positive(raw.serving_size);
  const pack = positive(raw.package_size);
  return {
    ok: true,
    draft: {
      name,
      brand: raw.brand?.trim().slice(0, 80) || null,
      unit: raw.unit,
      calories: macros.calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      fiber: macros.fiber,
      sugar: macros.sugar,
      sat_fat: macros.sat_fat,
      salt: macros.salt,
      micronutrients,
      serving_size: serving !== null && serving <= 10000 ? serving : null,
      serving_label: serving !== null && serving <= 10000 ? raw.serving_label?.trim().slice(0, 60) || null : null,
      package_size: pack !== null && pack <= 100000 ? pack : null,
    },
  };
}
