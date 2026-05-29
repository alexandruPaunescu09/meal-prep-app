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
  category: IngredientCategory;
  quantity_purchased: number;
  unit: string;
  package_price: number;
  price_per_unit: number;
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
  container_type_id: string | null;
  container_type?: ContainerType;
  created_at: string;
  updated_at: string;
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
  restrictions: string | null;
  allergies: string | null;
  preferences: string | null;
  notes: string | null;
  container_tolerance: number;
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
  carbs_per_kg: number | null;
  fat_per_kg: number | null;
  fiber_per_kg: number | null;
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
