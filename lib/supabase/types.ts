export type IngredientCategory = string;

export interface Category {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface Ingredient {
  id: string;
  name: string;
  brand: string | null;
  category: IngredientCategory;
  quantity_purchased: number;
  unit: string;
  /** NULL = price pending (RI-0c); price_per_unit is then NULL too. */
  package_price: number | null;
  price_per_unit: number | null;
  /** Grams per 1 buc (RI-0a); only meaningful when unit = 'buc'. Nutrition is per 100 g. */
  piece_weight_g: number | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sat_fat: number | null;
  salt: number | null;
  micronutrients: Record<string, number>;
  api_source: string | null;
  barcode: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContainerType {
  id: string;
  name: string;
  volume_ml: number | null;
  cost: number;
  created_at: string;
}

export interface Recipe {
  id: string;
  name: string;
  portions: number;
  final_weight: number | null;
  notes: string | null;
  customer_description: string | null;
  container_type_id: string | null;
  /** Where the recipe came from (http/https). Admin-only; not in recipes_public. */
  source_url: string | null;
  /** Ordered plain-text cooking steps. Admin-only; not in recipes_public. */
  instructions: string[];
  container_type?: ContainerType;
  created_at: string;
  updated_at: string;
}

export interface RecipeRatingStats {
  recipe_id: string;
  avg_rating: number;
  review_count: number;
  last_reviewed_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  ingredient?: Ingredient;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  calorie_target: number | null;
  weight_kg: number | null;
  /** Goal weight; when set, per-kg macro targets are computed on it. */
  target_weight_kg: number | null;
  restrictions: string | null;
  allergies: string | null;
  preferences: string | null;
  notes: string | null;
  container_tolerance: number;
  invited_at: string | null;
  registered_at: string | null;
  created_at: string;
}

export type PortalStatus = "not_invited" | "invited" | "active" | "disabled";

export interface ClientWithPortalStatus extends Client {
  latest_weight?: LatestWeight | null;
  portal_status: PortalStatus;
}

export interface Profile {
  id: string;
  role: "admin" | "customer";
  client_id: string | null;
  /** Last acknowledged "What's new" release id (lib/portal/whats-new.ts); null = none. */
  whats_new_seen: string | null;
  created_at: string;
}

export interface MealPlan {
  id: string;
  name: string;
  client_id: string | null;
  week_start: string;
  markup_multiplier: number;
  calorie_target: number | null;
  protein_per_kg: number | null;
  fat_per_kg: number | null;
  created_at: string;
  client?: Client;
}

export interface MealPlanEntry {
  id: string;
  meal_plan_id: string;
  day_of_week: number;
  meal_type: MealType;
  recipe_id: string | null;
  ingredient_id: string | null;
  quantity: number | null;
  portions: number;
  recipe?: Recipe & { recipe_ingredients: RecipeIngredient[] };
  ingredient?: Ingredient;
}

export interface NutritionData {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sat_fat: number | null;
  salt: number | null;
  micronutrients: Record<string, number>;
}

export interface NutritionSearchResult {
  name: string;
  brand: string | null;
  source: "openfoodfacts" | "usda";
  barcode: string | null;
  nutrition: NutritionData;
  completeness: number;
  dataType?: string;
  confidenceScore: number;
  category?: "primary" | "lightly_processed" | "composite";
}

export interface IngredientPriceHistory {
  id: string;
  ingredient_id: string;
  package_price: number;
  quantity_purchased: number;
  unit: string;
  price_per_unit: number;
  recorded_at: string;
}

export interface ContainerDelivery {
  id: string;
  client_id: string;
  meal_plan_id: string | null;
  delivery_date: string;
  notes: string | null;
  created_at: string;
  items?: ContainerDeliveryItem[];
  client?: Client;
}

export interface ContainerDeliveryItem {
  id: string;
  delivery_id: string;
  container_type_id: string;
  quantity_sent: number;
  quantity_returned: number;
  container_type?: ContainerType;
}

export interface ClientContainerBalance {
  client: Client;
  balances: { containerType: ContainerType; outstanding: number }[];
  totalOutstanding: number;
  flagged: boolean;
}

export type PrepType =
  | "wash"
  | "peel"
  | "chop"
  | "slice"
  | "dice"
  | "marinate"
  | "portion"
  | "thaw"
  | "soak"
  | "blanch";

export interface PrepRule {
  id: string;
  ingredient_category: IngredientCategory | null;
  ingredient_id: string | null;
  prep_type: PrepType;
  advance_days: number;
  time_estimate_minutes: number | null;
  notes: string | null;
  created_at: string;
  ingredient?: Ingredient;
}

export interface PrepTask {
  id: string;
  week_start: string;
  prep_date: string;
  cook_date: string;
  ingredient_id: string;
  prep_type: PrepType;
  quantity: number;
  unit: string;
  recipe_names: string[];
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  ingredient?: Ingredient;
}

export interface ShoppingCheckState {
  week_start: string;
  ingredient_id: string;
  checked_at: string;
}

export interface CookingCheckState {
  week_start: string;
  recipe_id: string;
  checked_at: string;
}

export type ReviewSentiment = "positive" | "negative" | "neutral";

export interface ReviewTag {
  id: string;
  label: string;
  sentiment: ReviewSentiment;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export interface MealReview {
  id: string;
  meal_plan_entry_id: string;
  client_id: string;
  recipe_id: string | null;
  rating: number;
  comment: string | null;
  photo_path: string | null;
  admin_read_at: string | null;
  created_at: string;
  updated_at: string;
  tags?: ReviewTag[];
  client?: Client;
  recipe?: Recipe;
}

export type MealStatus = "eaten" | "skipped";

export interface MealEntryStatus {
  meal_plan_entry_id: string;
  client_id: string;
  status: MealStatus;
  /** FD-2: share of the planned portion actually eaten (null = 1). Only set while status = 'eaten'. */
  portion_factor: number | null;
  updated_at: string;
}

export interface Invoice {
  id: string;
  store: string;
  invoice_date: string | null;
  total: number | null;
  file_names: string[];
  parsed: unknown;
  applied_lines: unknown;
  model: string | null;
  created_at: string;
}

export interface IngredientAlias {
  id: string;
  ingredient_id: string;
  store: string;
  alias: string;
  created_at: string;
}

export type MatchConfidence = "high" | "medium" | "low";

export interface ParsedInvoiceLine {
  raw_text: string;
  raw_name: string;
  quantity: number | null;
  line_total: number | null;
  is_food: boolean;
  ingredient_id: string | null;
  match_confidence: MatchConfidence | null;
  package_quantity: number | null;
  package_unit: "g" | "ml" | "buc" | null;
  package_price: number | null;
  note: string | null;
}

export interface ApplyInvoiceLine {
  ingredient_id: string;
  package_price: number;
  quantity_purchased: number;
  raw_name: string;
}

// ---- Atomic RPC payloads (migration 20261018000000_ux_integrity_rpcs) ----

/** supabase.rpc("save_recipe", { p_recipe_id, p_recipe, p_ingredients }) -> recipe id (uuid) */
export interface SaveRecipeInput {
  name: string;
  portions: number;
  final_weight: number | null;
  notes: string | null;
  customer_description: string | null;
  container_type_id: string | null;
  source_url: string | null;
  instructions: string[];
}

export interface SaveRecipeIngredientInput {
  ingredient_id: string;
  quantity: number;
}

/** supabase.rpc("clone_week", { p_source_week, p_target_week }) */
export interface CloneWeekResult {
  created: string[];
  skipped: number;
}

/** Items for supabase.rpc("log_container_delivery", { ..., p_items }) -> delivery id (uuid) */
export interface LogContainerDeliveryItem {
  container_type_id: string;
  quantity_sent: number;
  quantity_returned: number;
}

/** supabase.rpc("regenerate_prep_tasks", { p_week_start, p_tasks }) */
export interface RegeneratePrepResult {
  inserted: number;
  preserved_completed: number;
  dropped_completed: number;
}

// ---------------------------------------------------------------------------
// FD-0: customer-safe shapes (rows of the `ingredients_public` / `recipes_public`
// views). Portal code must use these so TypeScript proves no price / admin-notes
// fields are read. Do not add package_price, price_per_unit, quantity_purchased
// or notes here.
// ---------------------------------------------------------------------------
export type PublicIngredient = Omit<
  Ingredient,
  | "quantity_purchased"
  | "package_price"
  | "price_per_unit"
  | "api_source"
  | "created_at"
  | "updated_at"
>;

export type PublicRecipe = Omit<Recipe, "notes" | "container_type">;

/** meal_plan_entries row with portal-safe recipe/ingredient embeds. */
export type PortalEntry = Omit<MealPlanEntry, "recipe" | "ingredient"> & {
  recipe?: PublicRecipe & {
    recipe_ingredients: (Omit<RecipeIngredient, "ingredient"> & { ingredient: PublicIngredient })[];
  };
  ingredient?: PublicIngredient;
};

// ---------------------------------------------------------------------------
// Food diary (epic FD, story FD-1)
// ---------------------------------------------------------------------------

export type FoodStatus = "active" | "pending" | "hidden";
export type FoodSource = "off" | "label_photo" | "admin";

/** Shared consumer-product catalog row. Values are per 100 g / 100 ml. No prices. */
export interface Food {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  unit: "g" | "ml";
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sat_fat: number | null;
  salt: number | null;
  micronutrients: Record<string, number>;
  serving_size: number | null;
  serving_label: string | null;
  package_size: number | null;
  source: FoodSource;
  status: FoodStatus;
  created_by_client_id: string | null;
  verified_at: string | null;
  promoted_ingredient_id: string | null;
  /** Storage keys in the private `food-label-photos` bucket ({client_id}/{food_id}/label.jpg); label-photo foods only. */
  label_photo_path: string | null;
  front_photo_path: string | null;
  created_at: string;
  updated_at: string;
}

/** One label-photo parse attempt (FD-5 daily limit). Written server-side only. */
export interface FoodLabelParse {
  id: string;
  client_id: string;
  model: string | null;
  outcome: "ok" | "unreadable" | "error";
  created_at: string;
}

/** A customer's starred catalog item (FD-6). Exactly one of the three targets is set. */
export interface FoodFavorite {
  id: string;
  client_id: string;
  food_id: string | null;
  ingredient_id: string | null;
  recipe_id: string | null;
  created_at: string;
}

export type DiarySourceKind = "food" | "ingredient" | "recipe" | "quick";
export type DiaryQuantityUnit = "g" | "ml" | "serving" | "portion";

/** Diary row. Nutrient columns are the snapshot TOTALS for this entry (not per 100). */
export interface FoodLogEntry {
  id: string;
  client_id: string;
  log_date: string;
  meal_type: MealType;
  source_kind: DiarySourceKind;
  food_id: string | null;
  ingredient_id: string | null;
  recipe_id: string | null;
  quantity: number;
  quantity_unit: DiaryQuantityUnit;
  name: string;
  brand: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  sugar: number | null;
  sat_fat: number | null;
  salt: number | null;
  micronutrients: Record<string, number>;
  created_at: string;
  updated_at: string;
}

/** Same shape as `DayTotals` in lib/calculations/meal-plan.ts, without `cost`. */
export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sat_fat: number;
  salt: number;
  micronutrients: Record<string, number>;
}

/** Nutrition values for a reference amount (per 100 g/ml or per portion). */
export type CatalogNutrition = NutritionData;

/** Unified, price-free search result for the diary catalog. */
export interface CatalogItem {
  kind: "food" | "ingredient" | "recipe";
  id: string;
  name: string;
  brand: string | null;
  /** g/ml for foods and ingredients, 'portion' for recipes. */
  unit: "g" | "ml" | "portion";
  /** Per 100 g/ml. Set for foods and ingredients. */
  per100?: CatalogNutrition;
  /** Per one recipe portion. Set for recipes. */
  perPortion?: CatalogNutrition;
  /** g/ml per serving, when known (foods only). */
  servingSize?: number | null;
  servingLabel?: string | null;
  /** False for the customer's own unverified (pending) foods. */
  verified: boolean;
}

/** Result of the `merge_foods(p_from, p_into)` RPC (FD-12). */
export interface MergeFoodsResult {
  entries: number;
  favorites_moved: number;
  favorites_dropped: number;
  barcode_moved: boolean;
}

// ---------------------------------------------------------------------------
// FD-9: weight log
// ---------------------------------------------------------------------------

export interface WeightLog {
  id: string;
  client_id: string;
  log_date: string;
  weight_kg: number;
  created_at: string;
  updated_at: string;
}

/** Latest logged weight for a client (admin card). */
export interface LatestWeight {
  log_date: string;
  weight_kg: number;
}

/** GET /api/portal/weight response. */
export interface WeightResponse {
  logs: Pick<WeightLog, "id" | "log_date" | "weight_kg">[];
  weight_kg: number | null;
  target_weight_kg: number | null;
}

/** Snapshot columns written to food_log_entries by snapshotForCatalogItem(). */
export interface DiarySnapshot {
  name: string;
  brand: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sat_fat: number;
  salt: number;
  micronutrients: Record<string, number>;
}

// ---- Abuse-limit RPCs (migration 20261020000000_abuse_limits; service_role only) ----

/** supabase.rpc("check_rate_limit", { p_bucket, p_key_hash, p_limit, p_window }) -> true when allowed (hit recorded) */
export interface CheckRateLimitArgs {
  p_bucket: string;
  p_key_hash: string;
  p_limit: number;
  p_window: string;
}

/** supabase.rpc("create_food_with_quota", { p_client_id, p_food, p_limit }) -> new food id, or null when over quota */
export interface CreateFoodWithQuotaArgs {
  p_client_id: string;
  p_food: Record<string, unknown>;
  p_limit: number;
}

/** supabase.rpc("reserve_label_parse", { p_client_id, p_model, p_limit }) -> parse attempt id, or null when over limit */
export interface ReserveLabelParseArgs {
  p_client_id: string;
  p_model: string;
  p_limit: number;
}
