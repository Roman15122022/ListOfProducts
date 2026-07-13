import { describe, expect, it, vi } from "vitest";

import type { PantryItem } from "../domain/types";
import { searchRecipes } from "./client";
import { rankRecipesByPantry } from "./ingredients";
import type { RecipeIngredient, RecipeSummary } from "./types";

const createPantryItem = (
  id: string,
  name: string,
  canonicalName: string,
): PantryItem => ({
  id,
  name,
  normalizedName: canonicalName,
  canonicalName,
  categoryId: "other",
  createdAt: 1,
  updatedAt: 1,
});

const createIngredient = (food: string): RecipeIngredient => ({
  text: `1 ${food}`,
  quantity: 1,
  food,
});

const createRecipe = (
  label: string,
  ingredientNames: string[],
): RecipeSummary => ({
  uri: `recipe:${label}`,
  label,
  source: "Regression kitchen",
  url: "https://example.com/recipe",
  yield: 1,
  dietLabels: [],
  healthLabels: [],
  cautions: [],
  ingredientLines: ingredientNames.map((name) => `1 ${name}`),
  ingredients: ingredientNames.map(createIngredient),
  calories: 0,
  totalTime: 0,
  cuisineType: [],
  mealType: [],
  dishType: [],
});

const createMealDetails = (
  mealId: string,
  mealName: string,
  sourceUrl = "https://example.com/recipe",
) => ({
  idMeal: mealId,
  strMeal: mealName,
  strMealThumb: `https://www.themealdb.com/images/${mealId}.jpg`,
  strCategory: "Vegetarian",
  strArea: "Ukrainian",
  strSource: sourceUrl,
  strIngredient1: "Milk",
  strMeasure1: "1 cup",
});

describe("recipe regressions", () => {
  it("deduplicates equivalent selected ingredients before querying the API", async () => {
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        return Response.json({
          meals: [{ idMeal: "milk-recipe", strMeal: "Milk recipe" }],
        });
      }

      return Response.json({
        meals: [createMealDetails("milk-recipe", "Milk recipe")],
      });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["молоко", "Milk", "МОЛОКО"],
      fetchImplementation,
    });

    expect(recipes.map((recipe) => recipe.label)).toEqual(["Milk recipe"]);
    const filterRequests = vi.mocked(fetchImplementation).mock.calls.filter(
      ([requestUrl]) =>
        new URL(String(requestUrl)).pathname.endsWith("/filter.php"),
    );
    expect(filterRequests).toHaveLength(1);
    expect(new URL(String(filterRequests[0][0])).searchParams.get("i")).toBe(
      "Milk",
    );
  });

  it("keeps the strongest ingredient group ahead of partial groups", async () => {
    const listsByIngredient: Record<
      string,
      Array<{ idMeal: string; strMeal: string }>
    > = {
      Milk: [
        { idMeal: "triple", strMeal: "Triple match" },
        { idMeal: "milk-eggs", strMeal: "Milk and eggs" },
        { idMeal: "milk-only", strMeal: "Milk only" },
      ],
      Eggs: [
        { idMeal: "milk-eggs", strMeal: "Milk and eggs" },
        { idMeal: "triple", strMeal: "Triple match" },
        { idMeal: "eggs-only", strMeal: "Eggs only" },
      ],
      Cheese: [
        { idMeal: "triple", strMeal: "Triple match" },
        { idMeal: "cheese-only", strMeal: "Cheese only" },
      ],
    };
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        return Response.json({
          meals: listsByIngredient[parsedUrl.searchParams.get("i") ?? ""] ?? [],
        });
      }

      const mealId = parsedUrl.searchParams.get("i") ?? "unknown";
      return Response.json({
        meals: [createMealDetails(mealId, mealId)],
      });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["молоко", "яйця", "сир"],
      fetchImplementation,
    });

    expect(recipes.map((recipe) => recipe.label)).toEqual([
      "triple",
      "milk-eggs",
    ]);
  });

  it("does not let extra pantry items distort recipe coverage", () => {
    const pantryItems = [
      createPantryItem("milk", "Milk", "milk"),
      createPantryItem("eggs", "Eggs", "eggs"),
      createPantryItem("cheese", "Cheese", "cheese"),
      createPantryItem("rice", "Rice", "rice"),
    ];
    const recipes = [
      createRecipe("Complete milk recipe", ["Milk"]),
      createRecipe("Partial recipe", ["Milk", "Salt"]),
    ];

    const rankedRecipes = rankRecipesByPantry(recipes, pantryItems);

    expect(rankedRecipes).toEqual([
      expect.objectContaining({
        recipe: expect.objectContaining({ label: "Complete milk recipe" }),
        matchedIngredientCount: 1,
        missingIngredientCount: 0,
        coverage: 1,
      }),
      expect.objectContaining({
        recipe: expect.objectContaining({ label: "Partial recipe" }),
        matchedIngredientCount: 1,
        missingIngredientCount: 1,
        coverage: 0.5,
      }),
    ]);
  });

  it("rejects unsafe source URLs returned by the recipe provider", async () => {
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        return Response.json({
          meals: [
            { idMeal: "safe-link", strMeal: "Safe fallback" },
            { idMeal: null, strMeal: "Malformed result" },
          ],
        });
      }

      return Response.json({
        meals: [
          createMealDetails(
            "safe-link",
            "Safe fallback",
            "javascript:alert(1)",
          ),
        ],
      });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["Milk"],
      fetchImplementation,
    });

    expect(recipes).toHaveLength(1);
    expect(recipes[0].url).toBe("https://www.themealdb.com/meal/safe-link");
  });
});
