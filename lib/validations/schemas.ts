import { z } from "zod/v4";

export const ingredientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.enum([
    "protein",
    "dairy",
    "grains",
    "fruits",
    "vegetables",
    "fats",
    "nuts_seeds",
    "supplements",
    "bakery",
    "other",
  ]),
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
  category: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  portions: z.number().int().positive("Must be >= 1"),
  notes: z.string().nullable().optional(),
});

export type RecipeFormData = z.infer<typeof recipeSchema>;

export const clientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  calorie_target: z.number().int().positive().nullable().optional(),
  restrictions: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  preferences: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type ClientFormData = z.infer<typeof clientSchema>;
