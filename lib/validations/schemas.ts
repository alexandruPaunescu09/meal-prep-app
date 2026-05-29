import { z } from "zod/v4";

export const ingredientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  quantity_purchased: z.number().positive("Must be > 0"),
  unit: z.enum(["g", "ml", "buc"]),
  package_price: z.number().nonnegative("Must be >= 0"),
  calories: z.number().nonnegative().nullable().optional(),
  protein: z.number().nonnegative().nullable().optional(),
  carbs: z.number().nonnegative().nullable().optional(),
  fat: z.number().nonnegative().nullable().optional(),
  fiber: z.number().nonnegative().nullable().optional(),
  sugar: z.number().nonnegative().nullable().optional(),
  sat_fat: z.number().nonnegative().nullable().optional(),
  salt: z.number().nonnegative().nullable().optional(),
  micronutrients: z.record(z.string(), z.number()).optional(),
  api_source: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
});

export type IngredientFormData = z.infer<typeof ingredientSchema>;

export const recipeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  portions: z.number().int().positive("Must be >= 1"),
  notes: z.string().nullable().optional(),
});

export type RecipeFormData = z.infer<typeof recipeSchema>;

export const clientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  calorie_target: z.number().int().positive().nullable().optional(),
  weight_kg: z.number().positive().nullable().optional(),
  restrictions: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  preferences: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type ClientFormData = z.infer<typeof clientSchema>;

export const mealPlanSchema = z.object({
  name: z.string().min(1, "Name is required"),
  client_id: z.string().uuid().nullable().optional(),
  week_start: z.string(),
  markup_multiplier: z.number().positive(),
  calorie_target: z.number().int().positive().nullable().optional(),
  protein_per_kg: z.number().positive().nullable().optional(),
  fat_per_kg: z.number().positive().nullable().optional(),
});

export type MealPlanFormData = z.infer<typeof mealPlanSchema>;

export const prepRuleSchema = z.object({
  ingredient_category: z.string().nullable(),
  ingredient_id: z.string().nullable(),
  prep_type: z.enum([
    "wash", "peel", "chop", "slice", "dice",
    "marinate", "portion", "thaw", "soak", "blanch",
  ]),
  advance_days: z.number().int().nonnegative(),
  time_estimate_minutes: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type PrepRuleFormData = z.infer<typeof prepRuleSchema>;
