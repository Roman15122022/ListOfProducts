import type { PantryItem, ShoppingUnit } from "../domain/types";

export interface RecipeIngredient {
  text: string;
  quantity: number;
  measure?: string;
  food: string;
  weight?: number;
  foodCategory?: string;
  image?: string;
}

export interface RecipeSummary {
  uri: string;
  label: string;
  image?: string;
  source: string;
  url: string;
  yield: number;
  dietLabels: string[];
  healthLabels: string[];
  cautions: string[];
  ingredientLines: string[];
  ingredients: RecipeIngredient[];
  calories: number;
  totalTime: number;
  cuisineType: string[];
  mealType: string[];
  dishType: string[];
}

export interface RecipeSearchRequest {
  ingredients: string[];
  signal?: AbortSignal;
  apiKey?: string;
  apiOrigin?: string;
  fetchImplementation?: typeof fetch;
}

export type RecipeIngredientMatchType = "exact" | "contained" | "fuzzy";

export interface RecipeIngredientMatch {
  pantryItem: PantryItem;
  score: number;
  matchType: RecipeIngredientMatchType;
}

export interface RecipeShoppingInput {
  name: string;
  canonicalName: string;
  quantity: number;
  unit: ShoppingUnit;
  sourceText: string;
}

export interface RecipeIngredientReview extends RecipeShoppingInput {
  ingredient: RecipeIngredient;
  isMissing: boolean;
  matchedPantryItemId?: string;
}

export interface RankedRecipe {
  recipe: RecipeSummary;
  matchedIngredientCount: number;
  missingIngredientCount: number;
  coverage: number;
}
