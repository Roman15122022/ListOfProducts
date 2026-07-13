import { describe, expect, it } from "vitest";

import type { PantryItem } from "../domain/types";
import {
  buildRecipeIngredientReview,
  canonicalizeRecipeProductName,
  deduplicateRecipeShoppingInputs,
  getRecipeSearchIngredient,
  mapRecipeIngredientToShoppingInput,
  matchRecipeIngredient,
  rankRecipesByPantry,
} from "./ingredients";
import type { RecipeIngredient, RecipeSummary } from "./types";

const createPantryItem = (
  id: string,
  name: string,
  canonicalName = name.toLocaleLowerCase(),
): PantryItem => ({
  id,
  name,
  normalizedName: name.toLocaleLowerCase(),
  canonicalName,
  categoryId: "other",
  createdAt: 1,
  updatedAt: 1,
});

const createIngredient = (
  food: string,
  quantity = 1,
  measure?: string,
  weight?: number,
): RecipeIngredient => ({
  text: `${quantity} ${measure ?? ""} ${food}`.replace(/\s+/gu, " ").trim(),
  quantity,
  measure,
  food,
  weight,
});

const createRecipe = (
  label: string,
  ingredients: RecipeIngredient[],
): RecipeSummary => ({
  uri: `recipe:${label}`,
  label,
  source: "Test Kitchen",
  url: "https://example.com/recipe",
  yield: 2,
  dietLabels: [],
  healthLabels: [],
  cautions: [],
  ingredientLines: ingredients.map((ingredient) => ingredient.text),
  ingredients,
  calories: 500,
  totalTime: 20,
  cuisineType: [],
  mealType: [],
  dishType: [],
});

describe("recipe ingredient helpers", () => {
  it("canonicalizes known Russian and Ukrainian product names", () => {
    expect(canonicalizeRecipeProductName("Молоко")).toBe("milk");
    expect(canonicalizeRecipeProductName("помідори")).toBe("tomatoes");
    expect(getRecipeSearchIngredient("яйця")).toBe("Eggs");
  });

  it("maps metric, package and culinary measures", () => {
    expect(mapRecipeIngredientToShoppingInput(createIngredient("flour", 250, "gram")))
      .toMatchObject({ quantity: 250, unit: "g" });
    expect(mapRecipeIngredientToShoppingInput(createIngredient("tomatoes", 2, "whole")))
      .toMatchObject({ quantity: 2, unit: "pcs" });
    expect(mapRecipeIngredientToShoppingInput(createIngredient("beans", 2, "can")))
      .toMatchObject({ quantity: 2, unit: "pack" });
    expect(mapRecipeIngredientToShoppingInput(createIngredient("rice", 3, "cup", 555)))
      .toMatchObject({ quantity: 555, unit: "g" });
    expect(mapRecipeIngredientToShoppingInput(createIngredient("oil", 2, "tablespoon")))
      .toMatchObject({ quantity: 30, unit: "ml" });
  });

  it("matches pantry ingredients without treating a single word as a contained match", () => {
    const pantryItems = [
      createPantryItem("milk", "Milk", "milk"),
      createPantryItem("oat-milk", "Oat milk", "oat milk"),
    ];

    expect(matchRecipeIngredient(createIngredient("milk"), pantryItems)?.pantryItem.id)
      .toBe("milk");
    expect(matchRecipeIngredient(createIngredient("almond milk"), pantryItems)).toBeNull();
    expect(
      matchRecipeIngredient(createIngredient("milk"), [
        createPantryItem("oat-milk", "Oat milk", "oat milk"),
      ]),
    ).toBeNull();
  });

  it("builds a deduplicated review and marks missing ingredients", () => {
    const recipe = createRecipe("Soup", [
      createIngredient("tomatoes", 2, "whole"),
      createIngredient("tomato", 1, "whole"),
      createIngredient("salt", 1, "teaspoon"),
    ]);
    const reviews = buildRecipeIngredientReview(recipe, [
      createPantryItem("tomatoes", "Tomatoes", "tomatoes"),
    ]);

    expect(reviews).toHaveLength(2);
    expect(reviews.find((review) => review.canonicalName === "tomatoes"))
      .toMatchObject({ quantity: 3, isMissing: false });
    expect(reviews.find((review) => review.canonicalName === "salt"))
      .toMatchObject({ quantity: 5, unit: "ml", isMissing: true });
  });

  it("deduplicates shopping inputs by canonical product name", () => {
    const inputs = [
      mapRecipeIngredientToShoppingInput(createIngredient("молоко", 1, "liter")),
      mapRecipeIngredientToShoppingInput(createIngredient("Milk", 2, "liter")),
    ];

    expect(deduplicateRecipeShoppingInputs(inputs)).toEqual([
      expect.objectContaining({ canonicalName: "milk", quantity: 3, unit: "l" }),
    ]);
  });

  it("ranks recipes by the share of recipe ingredients available at home", () => {
    const pantryItems = [
      createPantryItem("milk", "Milk", "milk"),
      createPantryItem("tomatoes", "Tomatoes", "tomatoes"),
    ];
    const recipes = [
      createRecipe("Milk only", [createIngredient("milk")]),
      createRecipe("Complete match", [
        createIngredient("milk"),
        createIngredient("tomatoes"),
        createIngredient("salt"),
      ]),
    ];

    const rankedRecipes = rankRecipesByPantry(recipes, pantryItems);

    expect(rankedRecipes[0]).toMatchObject({
      matchedIngredientCount: 1,
      missingIngredientCount: 0,
      coverage: 1,
    });
    expect(rankedRecipes[0].recipe.label).toBe("Milk only");
    expect(rankedRecipes[1]).toMatchObject({
      matchedIngredientCount: 2,
      missingIngredientCount: 1,
      coverage: 2 / 3,
    });
    expect(rankedRecipes[1].recipe.label).toBe("Complete match");
  });
});
