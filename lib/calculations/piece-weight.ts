/** The ingredient fields needed to turn a quantity into grams. */
export interface PieceWeighted {
  unit?: string | null;
  piece_weight_g?: number | null;
}

/** True for a `buc` (pieces) ingredient that has no gram weight yet. */
export function missingPieceWeight(ing: PieceWeighted): boolean {
  return ing.unit === "buc" && !(ing.piece_weight_g != null && ing.piece_weight_g > 0);
}

/**
 * The amount (g or ml) a recipe / plan quantity stands for, used for nutrition
 * (nutrition is stored per 100 g). A `buc` ingredient with a piece weight turns
 * pieces into grams; everything else keeps today's behaviour (the quantity IS the amount).
 * Cost and shopping quantities stay per piece: do not use this for those.
 */
export function nutritionGrams(ing: PieceWeighted, quantity: number): number {
  if (ing.unit === "buc" && ing.piece_weight_g != null && ing.piece_weight_g > 0) {
    return quantity * ing.piece_weight_g;
  }
  return quantity;
}
