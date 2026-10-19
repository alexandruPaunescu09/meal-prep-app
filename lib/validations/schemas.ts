import { z } from "zod/v4";
import { parseLocalDate } from "@/lib/format";

export const ingredientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  brand: z.string().nullable().optional(),
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
  customer_description: z.string().nullable().optional(),
});

export type RecipeFormData = z.infer<typeof recipeSchema>;

export const clientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  calorie_target: z.number().int().positive().nullable().optional(),
  weight_kg: z.number().positive().nullable().optional(),
  target_weight_kg: z
    .number()
    .min(30, "Goal weight must be between 30 and 300 kg.")
    .max(300, "Goal weight must be between 30 and 300 kg.")
    .nullable()
    .optional(),
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

export const reviewSchema = z.object({
  meal_plan_entry_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).nullable().optional(),
  tag_ids: z.array(z.string().uuid()).optional(),
  photo_path: z.string().nullable().optional(),
});

export type ReviewFormData = z.infer<typeof reviewSchema>;

export const reviewTagSchema = z.object({
  label: z.string().min(1).max(80),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  sort_order: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
});

export type ReviewTagFormData = z.infer<typeof reviewTagSchema>;

export const mealStatusSchema = z.object({
  meal_plan_entry_id: z.string().uuid(),
  status: z.enum(["eaten", "skipped"]).nullable(),
  /** FD-2: eaten share of the planned portion; ignored unless status is 'eaten'. */
  portion_factor: z.number().gt(0).max(5).nullable().optional(),
});

/** Several status changes in one request (e.g. "Mark remaining as eaten"); applied together. */
export const mealStatusBatchSchema = z.object({
  changes: z.array(mealStatusSchema).min(1).max(50),
});

export type MealStatusFormData = z.infer<typeof mealStatusSchema>;

export const inviteSchema = z.object({
  client_id: z.string().uuid(),
  action: z.enum(["invite", "resend", "revoke"]).default("invite"),
});

export type InviteFormData = z.infer<typeof inviteSchema>;

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  phone: z.string().nullable().optional(),
  weight_kg: z
    .number()
    .min(20, "Enter a weight between 20 and 300 kg, e.g. 72,5.")
    .max(300, "Enter a weight between 20 and 300 kg, e.g. 72,5.")
    .nullable()
    .optional(),
  target_weight_kg: z
    .number()
    .min(30, "Enter a goal weight between 30 and 300 kg, e.g. 68,5.")
    .max(300, "Enter a goal weight between 30 and 300 kg, e.g. 68,5.")
    .nullable()
    .optional(),
  calorie_target: z
    .number()
    .int("Enter a whole number between 800 and 6000.")
    .min(800, "Enter a whole number between 800 and 6000.")
    .max(6000, "Enter a whole number between 800 and 6000.")
    .nullable()
    .optional(),
  restrictions: z.string().nullable().optional(),
  allergies: z.string().nullable().optional(),
  preferences: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type RegisterFormData = z.infer<typeof registerSchema>;

// ---------------------------------------------------------------------------
// Food diary (FD-1)
// ---------------------------------------------------------------------------

const optionalMacro = z.number().min(0).max(500).nullable().optional();

/**
 * Body of POST /api/portal/diary. `id` is generated by the client so offline
 * replays upsert idempotently. Nutrition values are only accepted for quick
 * adds; for catalog kinds the server computes the snapshot.
 */
export const diaryEntrySchema = z
  .object({
    id: z.string().uuid(),
    log_date: z
      .string()
      .refine((s) => parseLocalDate(s) !== null, "log_date must be a valid YYYY-MM-DD date"),
    meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    source_kind: z.enum(["food", "ingredient", "recipe", "quick"]),
    food_id: z.string().uuid().nullable().optional(),
    ingredient_id: z.string().uuid().nullable().optional(),
    recipe_id: z.string().uuid().nullable().optional(),
    quantity: z.number().gt(0).max(5000),
    quantity_unit: z.enum(["g", "ml", "serving", "portion"]),
    // quick add only
    name: z.string().trim().max(100).nullable().optional(),
    calories: z.number().min(0).max(5000).nullable().optional(),
    protein: optionalMacro,
    carbs: optionalMacro,
    fat: optionalMacro,
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (v.source_kind === "quick") {
      if (v.food_id || v.ingredient_id || v.recipe_id) {
        issue("source_kind", "Quick add cannot reference a catalog item");
      }
      if (v.calories == null) issue("calories", "Calories are required for quick add");
      if (v.quantity !== 1) issue("quantity", "Quick add quantity must be 1");
      if (v.quantity_unit !== "serving") issue("quantity_unit", "Quick add unit must be 'serving'");
      return;
    }

    const ids = { food: v.food_id, ingredient: v.ingredient_id, recipe: v.recipe_id } as const;
    for (const [kind, id] of Object.entries(ids)) {
      if (kind === v.source_kind) {
        if (!id) issue(`${kind}_id`, `${kind}_id is required`);
      } else if (id) {
        issue(`${kind}_id`, `${kind}_id must be empty for ${v.source_kind} entries`);
      }
    }
    if (v.source_kind === "recipe") {
      if (v.quantity_unit !== "portion") issue("quantity_unit", "Recipes are logged in portions");
    } else if (v.quantity_unit === "portion") {
      issue("quantity_unit", "Only recipes are logged in portions");
    }
    // Catalog entries never carry client-sent nutrition.
    for (const k of ["calories", "protein", "carbs", "fat"] as const) {
      if (v[k] != null) issue(k, "Nutrition values are only accepted for quick add");
    }
  });

export type DiaryEntryInput = z.infer<typeof diaryEntrySchema>;

// ---------------------------------------------------------------------------
// Food favorites (FD-6)
// ---------------------------------------------------------------------------

/** Body of POST /api/portal/foods/favorites and the query of DELETE (`kind` + `id`). */
export const favoriteTargetSchema = z.object({
  kind: z.enum(["food", "ingredient", "recipe"]),
  id: z.string().uuid(),
});

export type FavoriteTarget = z.infer<typeof favoriteTargetSchema>;

// --- FD-5: label photo -> pending food -------------------------------------------------------

const nullableNum = z.number().finite().nullable();

/** POST /api/portal/foods/label body. Paths are checked against the customer's folder in the route. */
export const labelParseSchema = z.object({
  food_id: z.string().uuid(),
  barcode: z.string().max(20).nullable().optional(),
  label_photo_path: z.string().min(1).max(200),
  front_photo_path: z.string().min(1).max(200).nullable().optional(),
});
export type LabelParseInput = z.infer<typeof labelParseSchema>;

/** POST /api/portal/foods/label/confirm body: the signed draft the parse call returned. */
export const labelConfirmSchema = z.object({
  food_id: z.string().uuid(),
  barcode: z.string().max(20).nullable().optional(),
  label_photo_path: z.string().min(1).max(200),
  front_photo_path: z.string().min(1).max(200).nullable().optional(),
  draft: z.object({
    name: z.string().min(1).max(120),
    brand: z.string().max(80).nullable(),
    unit: z.enum(["g", "ml"]),
    calories: z.number().finite(),
    protein: z.number().finite(),
    carbs: z.number().finite(),
    fat: z.number().finite(),
    fiber: nullableNum,
    sugar: nullableNum,
    sat_fat: nullableNum,
    salt: nullableNum,
    micronutrients: z.record(z.string(), z.number().finite()),
    serving_size: nullableNum,
    serving_label: z.string().max(60).nullable(),
    package_size: nullableNum,
  }),
  issued_at: z.number().int(),
  signature: z.string().max(128),
});
export type LabelConfirmInput = z.infer<typeof labelConfirmSchema>;

// ---------------------------------------------------------------------------
// FD-12: admin edit of a shared catalog food (per 100 g/ml)
// ---------------------------------------------------------------------------

const per100 = (max: number) => z.number().min(0, "Must be >= 0").max(max, `Must be <= ${max}`);

export const foodEditSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  brand: z.string().trim().max(80, "Brand is too long").nullable(),
  unit: z.enum(["g", "ml"]),
  calories: per100(900),
  protein: per100(100),
  carbs: per100(100),
  fat: per100(100),
  fiber: per100(100).nullable(),
  sugar: per100(100).nullable(),
  sat_fat: per100(100).nullable(),
  salt: per100(100).nullable(),
  serving_size: z.number().positive("Must be > 0").max(5000, "Must be <= 5000").nullable(),
  serving_label: z.string().trim().max(60, "Label is too long").nullable(),
});

export type FoodEditInput = z.infer<typeof foodEditSchema>;
