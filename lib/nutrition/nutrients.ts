/**
 * Central nutrient registry: keys, labels, units and EU reference values.
 *
 * Reference values come from Regulation (EU) No 1169/2011, Annex XIII:
 *  - Part B reference intakes (RI) for energy and macronutrients
 *  - Part A nutrient reference values (NRV) for vitamins and minerals
 * Fiber has no EU reference intake (EFSA's adequate intake is 25 g/day), so it
 * is stored as null; the app uses its own 10-14 g per 1000 kcal range instead.
 */

export type NutrientGroup = "macro" | "limit" | "vitamin" | "mineral";

export interface NutrientDef {
  /** Column name (macros) or key inside the `micronutrients` JSONB. */
  key: string;
  label: string;
  unit: string;
  group: NutrientGroup;
  /** EU reference intake / NRV per day, null when none exists. */
  reference: number | null;
  /** True for the 8 per-100 columns; false for JSONB micronutrients. */
  column: boolean;
}

const def = (
  key: string,
  label: string,
  unit: string,
  group: NutrientGroup,
  reference: number | null,
  column = false
): NutrientDef => ({ key, label, unit, group, reference, column });

/** The 8 nutrient columns present on ingredients / foods / diary entries. */
export const MACRO_NUTRIENTS: NutrientDef[] = [
  def("calories", "Energy", "kcal", "macro", 2000, true),
  def("protein", "Protein", "g", "macro", 50, true),
  def("carbs", "Carbohydrate", "g", "macro", 260, true),
  def("fat", "Fat", "g", "macro", 70, true),
  def("fiber", "Fiber", "g", "macro", null, true),
  def("sugar", "Sugars", "g", "limit", 90, true),
  def("sat_fat", "Saturated fat", "g", "limit", 20, true),
  def("salt", "Salt", "g", "limit", 6, true),
];

/** Micronutrient keys used in the data (NRVs from Annex XIII Part A). */
export const MICRONUTRIENTS: NutrientDef[] = [
  def("vitamin_a_ug", "Vitamin A", "µg", "vitamin", 800),
  def("vitamin_d_ug", "Vitamin D", "µg", "vitamin", 5),
  def("vitamin_e_mg", "Vitamin E", "mg", "vitamin", 12),
  def("vitamin_k_ug", "Vitamin K", "µg", "vitamin", 75),
  def("vitamin_c_mg", "Vitamin C", "mg", "vitamin", 80),
  def("folate_ug", "Folate", "µg", "vitamin", 200),
  def("vitamin_b12_ug", "Vitamin B12", "µg", "vitamin", 2.5),
  def("potassium_mg", "Potassium", "mg", "mineral", 2000),
  def("calcium_mg", "Calcium", "mg", "mineral", 800),
  def("phosphorus_mg", "Phosphorus", "mg", "mineral", 700),
  def("magnesium_mg", "Magnesium", "mg", "mineral", 375),
  def("iron_mg", "Iron", "mg", "mineral", 14),
  def("zinc_mg", "Zinc", "mg", "mineral", 10),
  def("selenium_ug", "Selenium", "µg", "mineral", 55),
];

export const NUTRIENTS: NutrientDef[] = [...MACRO_NUTRIENTS, ...MICRONUTRIENTS];

const BY_KEY = new Map(NUTRIENTS.map((n) => [n.key, n]));

const UNIT_SUFFIXES: Record<string, string> = { ug: "µg", mg: "mg", g: "g", kcal: "kcal", iu: "IU" };

/**
 * Definition for any key. Unknown micronutrient keys (e.g. "vitamin_b6_mg")
 * get a label and unit derived from the key and no reference value.
 */
export function getNutrient(key: string): NutrientDef {
  const known = BY_KEY.get(key);
  if (known) return known;

  const parts = key.split("_").filter(Boolean);
  const last = parts[parts.length - 1]?.toLowerCase();
  let unit = "";
  if (parts.length > 1 && last && last in UNIT_SUFFIXES) {
    unit = UNIT_SUFFIXES[last];
    parts.pop();
  }
  const label = parts
    .map((p) => (/^[a-z]\d*$/i.test(p) && p.length <= 3 && /\d/.test(p) ? p.toUpperCase() : p))
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase());
  return { key, label: label || key, unit, group: key.startsWith("vitamin") ? "vitamin" : "mineral", reference: null, column: false };
}

/** Percent of the EU reference value, or null when the nutrient has none. */
export function percentOfReference(key: string, amount: number): number | null {
  const ref = getNutrient(key).reference;
  if (ref == null || ref <= 0) return null;
  return (amount / ref) * 100;
}
