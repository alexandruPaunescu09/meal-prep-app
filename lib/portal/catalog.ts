import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogItem, CatalogNutrition, Food } from "@/lib/supabase/types";
import { planEntryNutrition, type NutritionSource } from "@/lib/calculations/diary";

/**
 * Server-side catalog access for the customer diary. Callers must have verified
 * the customer first, then pass the SERVICE-ROLE client: these reads bypass RLS
 * on purpose (customers have no direct SELECT on ingredients/recipes after FD-0).
 * Column lists are explicit and never include package_price, price_per_unit,
 * quantity_purchased or recipes.notes.
 */

const NUTRITION_COLS = "calories, protein, carbs, fat, fiber, sugar, sat_fat, salt, micronutrients";
export const FOOD_COLS = `id, barcode, name, brand, unit, ${NUTRITION_COLS}, serving_size, serving_label, status, created_by_client_id, promoted_ingredient_id`;
export const INGREDIENT_COLS = `id, name, brand, unit, piece_weight_g, ${NUTRITION_COLS}`;
const RECIPE_COLS = `id, name, portions, recipe_ingredients(quantity, ingredient:ingredients(unit, piece_weight_g, ${NUTRITION_COLS}))`;

const SEARCH_FETCH_LIMIT = 50;
const RECIPE_CANDIDATE_LIMIT = 200;

type NutritionRow = NutritionSource;

/** Escape LIKE wildcards so user input is matched literally. */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Lower is better: 0 exact, 1 prefix, 2 word prefix, 3 contains. */
export function matchRank(name: string, query: string): number {
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(/[\s,.\-/()]+/).some((w) => w.startsWith(q))) return 2;
  return 3;
}

/** Sort: match quality first, then shorter names, then alphabetical. */
export function rankItems(items: CatalogItem[], query: string): CatalogItem[] {
  return items
    .map((it) => ({ it, r: matchRank(it.name, query) }))
    .sort(
      (a, b) =>
        a.r - b.r || a.it.name.length - b.it.name.length || a.it.name.localeCompare(b.it.name)
    )
    .map((x) => x.it);
}

function toNutrition(row: NutritionRow): CatalogNutrition {
  return {
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    fiber: row.fiber,
    sugar: row.sugar,
    sat_fat: row.sat_fat,
    salt: row.salt,
    micronutrients: row.micronutrients ?? {},
  };
}

type FoodRow = Pick<
  Food,
  | "id"
  | "name"
  | "brand"
  | "unit"
  | "serving_size"
  | "serving_label"
  | "status"
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "fiber"
  | "sugar"
  | "sat_fat"
  | "salt"
  | "micronutrients"
>;

export function foodToItem(f: FoodRow): CatalogItem {
  return {
    kind: "food",
    id: f.id,
    name: f.name,
    brand: f.brand,
    unit: f.unit,
    per100: toNutrition(f),
    servingSize: f.serving_size,
    servingLabel: f.serving_label,
    verified: f.status === "active",
  };
}

type IngredientRow = NutritionRow & {
  id: string;
  name: string;
  brand: string | null;
  unit: string;
  piece_weight_g?: number | null;
};

export function ingredientToItem(i: IngredientRow): CatalogItem {
  const pieceWeight =
    i.unit === "buc" && i.piece_weight_g != null && i.piece_weight_g > 0 ? i.piece_weight_g : null;
  return {
    kind: "ingredient",
    id: i.id,
    name: i.name,
    brand: i.brand,
    // A 'buc' (pieces) ingredient WITH a piece weight is logged in grams with one piece as the
    // serving. Without a weight it keeps the old mapping (the count counts as grams).
    unit: i.unit === "ml" ? "ml" : "g",
    per100: toNutrition(i),
    ...(pieceWeight ? { servingSize: pieceWeight, servingLabel: "piece" } : {}),
    verified: true,
  };
}

type RecipeIngredientRow = NutritionRow & { unit?: string | null; piece_weight_g?: number | null };

type RecipeRow = {
  id: string;
  name: string;
  portions: number;
  recipe_ingredients: { quantity: number; ingredient: RecipeIngredientRow | RecipeIngredientRow[] | null }[];
};

export function recipeToItem(r: RecipeRow): CatalogItem {
  const perPortion = planEntryNutrition({
    meal_type: "lunch",
    portions: 1,
    quantity: null,
    recipe: {
      portions: r.portions,
      recipe_ingredients: r.recipe_ingredients.map((ri) => ({
        quantity: ri.quantity,
        ingredient: Array.isArray(ri.ingredient) ? (ri.ingredient[0] ?? null) : ri.ingredient,
      })),
    },
  });
  return {
    kind: "recipe",
    id: r.id,
    name: r.name,
    brand: null,
    unit: "portion",
    perPortion,
    verified: true,
  };
}

const PAGE_SIZE = 1000; // PostgREST max_rows (supabase/config.toml)

/** Collects every row of a paginated query (PostgREST caps one response at max_rows). */
export async function collectPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<T[]>,
  pageSize = PAGE_SIZE
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const rows = await fetchPage(from, from + pageSize - 1);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

/** The subset of `candidateIds` that appear in at least one of this client's meal plans. */
async function recipeIdsInClientPlans(
  service: SupabaseClient,
  clientId: string,
  candidateIds: string[]
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await collectPages<{ recipe_id: string }>(async (from, to) => {
    const { data, error } = await service
      .from("meal_plan_entries")
      .select("recipe_id, meal_plans!inner(client_id)")
      .eq("meal_plans.client_id", clientId)
      .in("recipe_id", candidateIds)
      .order("id")
      .range(from, to);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as { recipe_id: string }[];
  });
  return new Set(rows.map((r) => r.recipe_id));
}

const foodVisibility = (clientId: string) =>
  `and(status.eq.active,promoted_ingredient_id.is.null),and(status.eq.pending,created_by_client_id.eq.${clientId})`;

export async function searchCatalog(
  service: SupabaseClient,
  clientId: string,
  rawQuery: string,
  limit: number
): Promise<CatalogItem[]> {
  const q = rawQuery.trim();
  const pattern = `%${escapeLike(q)}%`;

  // name and brand are separate queries: PostgREST's or() syntax cannot safely carry arbitrary user text.
  const foods = (col: "name" | "brand") =>
    service
      .from("foods")
      .select(FOOD_COLS)
      .or(foodVisibility(clientId))
      .ilike(col, pattern)
      .limit(SEARCH_FETCH_LIMIT);
  const ingredients = (col: "name" | "brand") =>
    service.from("ingredients").select(INGREDIENT_COLS).ilike(col, pattern).limit(SEARCH_FETCH_LIMIT);
  // Recipes: match by name first, then keep the ones that appear in this client's plans.
  const recipes = Promise.resolve(
    service.from("recipes").select(RECIPE_COLS).ilike("name", pattern).limit(RECIPE_CANDIDATE_LIMIT)
  ).then(async (res) => {
    if (res.error) return res;
    const rows = (res.data ?? []) as unknown as RecipeRow[];
    const members = await recipeIdsInClientPlans(service, clientId, rows.map((r) => r.id));
    return { data: rows.filter((r) => members.has(r.id)), error: null };
  });

  const results = await Promise.all([
    foods("name"),
    foods("brand"),
    ingredients("name"),
    ingredients("brand"),
    recipes,
  ]);
  for (const r of results) if (r.error) throw new Error(r.error.message);

  const seen = new Map<string, CatalogItem>();
  const add = (item: CatalogItem) => {
    const key = `${item.kind}:${item.id}`;
    if (!seen.has(key)) seen.set(key, item);
  };
  for (const r of [results[0], results[1]]) (r.data as unknown as FoodRow[]).forEach((f) => add(foodToItem(f)));
  for (const r of [results[2], results[3]]) (r.data as unknown as IngredientRow[]).forEach((i) => add(ingredientToItem(i)));
  (results[4].data as unknown as RecipeRow[]).forEach((rec) => add(recipeToItem(rec)));

  return rankItems([...seen.values()], q).slice(0, limit);
}

/**
 * Loads one catalog item the customer is allowed to log, or null when it does
 * not exist / is not usable by this client.
 */
export async function loadCatalogItem(
  service: SupabaseClient,
  clientId: string,
  kind: "food" | "ingredient" | "recipe",
  id: string
): Promise<CatalogItem | null> {
  if (kind === "food") {
    const { data, error } = await service.from("foods").select(FOOD_COLS).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const f = data as unknown as FoodRow & { created_by_client_id: string | null };
    const usable = f.status === "active" || (f.status === "pending" && f.created_by_client_id === clientId);
    return usable ? foodToItem(f) : null;
  }
  if (kind === "ingredient") {
    const { data, error } = await service.from("ingredients").select(INGREDIENT_COLS).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? ingredientToItem(data as unknown as IngredientRow) : null;
  }
  if (!(await recipeIdsInClientPlans(service, clientId, [id])).has(id)) return null;
  const { data, error } = await service.from("recipes").select(RECIPE_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? recipeToItem(data as unknown as RecipeRow) : null;
}

/**
 * Batch version of loadCatalogItem: resolves many targets in at most three queries and returns
 * only the ones this client may use (key `kind:id`). Hidden foods, other customers' pending
 * foods and recipes outside the client's plans are simply absent.
 */
export async function loadCatalogItems(
  service: SupabaseClient,
  clientId: string,
  refs: { kind: "food" | "ingredient" | "recipe"; id: string }[]
): Promise<Map<string, CatalogItem>> {
  const ids = (kind: string) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))];
  const foodIds = ids("food");
  const ingredientIds = ids("ingredient");
  const recipeIds = ids("recipe");

  const [foods, ingredients, recipes] = await Promise.all([
    foodIds.length
      ? service.from("foods").select(FOOD_COLS).in("id", foodIds)
      : Promise.resolve({ data: [], error: null }),
    ingredientIds.length
      ? service.from("ingredients").select(INGREDIENT_COLS).in("id", ingredientIds)
      : Promise.resolve({ data: [], error: null }),
    recipeIds.length
      ? recipeIdsInClientPlans(service, clientId, recipeIds).then(async (members) => {
          if (members.size === 0) return { data: [], error: null };
          return service.from("recipes").select(RECIPE_COLS).in("id", [...members]);
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [foods, ingredients, recipes]) if (r.error) throw new Error(r.error.message);

  const out = new Map<string, CatalogItem>();
  for (const f of (foods.data ?? []) as unknown as (FoodRow & { created_by_client_id: string | null })[]) {
    const usable = f.status === "active" || (f.status === "pending" && f.created_by_client_id === clientId);
    if (usable) out.set(`food:${f.id}`, foodToItem(f));
  }
  for (const i of (ingredients.data ?? []) as unknown as IngredientRow[]) {
    out.set(`ingredient:${i.id}`, ingredientToItem(i));
  }
  for (const r of (recipes.data ?? []) as unknown as RecipeRow[]) {
    out.set(`recipe:${r.id}`, recipeToItem(r));
  }
  return out;
}
