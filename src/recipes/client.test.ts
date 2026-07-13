import { describe, expect, it, vi } from "vitest";

import { RecipeApiError, searchRecipes } from "./client";

const createMeal = (
  idMeal: string,
  strMeal: string,
  ingredients: Array<{ name: string; measure: string }>,
) => {
  const meal: Record<string, string | null> = {
    idMeal,
    strMeal,
    strMealThumb: `https://www.themealdb.com/images/${idMeal}.jpg`,
    strCategory: "Vegetarian",
    strArea: "Italian",
    strSource: `https://example.com/${idMeal}`,
  };

  ingredients.forEach((ingredient, ingredientIndex) => {
    const fieldIndex = ingredientIndex + 1;
    meal[`strIngredient${fieldIndex}`] = ingredient.name;
    meal[`strMeasure${fieldIndex}`] = ingredient.measure;
  });

  return meal;
};

const mealsById = {
  "1": createMeal("1", "Milk soup", [
    { name: "Milk", measure: "200ml" },
    { name: "Salt", measure: "1/2 tsp" },
  ]),
  "2": createMeal("2", "Cheese omelette", [
    { name: "Eggs", measure: "3" },
    { name: "Cheese", measure: "100 g" },
  ]),
  "3": createMeal("3", "Egg curry", [
    { name: "Eggs", measure: "4" },
    { name: "Tomatoes", measure: "2" },
  ]),
};

describe("recipe client", () => {
  it("keeps intersecting recipes and loads their full details", async () => {
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        const ingredient = parsedUrl.searchParams.get("i");
        return Response.json({
          meals:
            ingredient === "Milk"
              ? [
                  { idMeal: "1", strMeal: "Milk soup" },
                  { idMeal: "2", strMeal: "Cheese omelette" },
                ]
              : [
                  { idMeal: "2", strMeal: "Cheese omelette" },
                  { idMeal: "3", strMeal: "Egg curry" },
                ],
        });
      }

      const mealId = parsedUrl.searchParams.get("i") as keyof typeof mealsById;
      return Response.json({ meals: [mealsById[mealId]] });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["молоко", "яйця"],
      apiKey: "test-key",
      apiOrigin: "https://recipes.example",
      fetchImplementation,
    });

    expect(recipes.map((recipe) => recipe.label)).toEqual(["Cheese omelette"]);
    expect(recipes[0].ingredients).toEqual([
      expect.objectContaining({ food: "Eggs", quantity: 3 }),
      expect.objectContaining({ food: "Cheese", quantity: 100, measure: "g" }),
    ]);

    const requestedUrls = vi
      .mocked(fetchImplementation)
      .mock.calls.map(([requestUrl]) => new URL(String(requestUrl)));
    expect(requestedUrls.filter((url) => url.pathname.endsWith("/filter.php")))
      .toHaveLength(2);
    expect(requestedUrls.filter((url) => url.pathname.endsWith("/lookup.php")))
      .toHaveLength(1);
    expect(requestedUrls[0].pathname).toContain("/api/json/v1/test-key/");
    expect(vi.mocked(fetchImplementation).mock.calls[0][1]?.cache).toBe("no-store");
  });

  it("parses compact and fractional ingredient measures", async () => {
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        return Response.json({
          meals: [{ idMeal: "1", strMeal: "Milk soup" }],
        });
      }

      return Response.json({ meals: [mealsById["1"]] });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["молоко"],
      fetchImplementation,
    });

    expect(recipes[0].ingredients[0]).toMatchObject({
      food: "Milk",
      quantity: 200,
      measure: "ml",
    });
    expect(recipes[0].ingredients[1]).toMatchObject({
      food: "Salt",
      quantity: 0.5,
      measure: "tsp",
    });
  });

  it("finds an ingredient intersection beyond the first four API results", async () => {
    const milkMeals = Array.from({ length: 7 }, (_, mealIndex) => ({
      idMeal: `milk-${mealIndex + 1}`,
      strMeal: `Milk meal ${mealIndex + 1}`,
    }));
    const eggMeals = Array.from({ length: 6 }, (_, mealIndex) => ({
      idMeal: `egg-${mealIndex + 1}`,
      strMeal: `Egg meal ${mealIndex + 1}`,
    }));
    const sharedMeal = { idMeal: "shared", strMeal: "Milk egg bake" };
    milkMeals.push(sharedMeal);
    eggMeals.push(sharedMeal);

    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        return Response.json({
          meals:
            parsedUrl.searchParams.get("i") === "Milk" ? milkMeals : eggMeals,
        });
      }

      return Response.json({
        meals: [
          createMeal("shared", "Milk egg bake", [
            { name: "Milk", measure: "200 ml" },
            { name: "Eggs", measure: "2" },
          ]),
        ],
      });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["молоко", "яйця"],
      fetchImplementation,
    });

    expect(recipes.map((recipe) => recipe.label)).toEqual(["Milk egg bake"]);
    expect(
      vi
        .mocked(fetchImplementation)
        .mock.calls.filter(([requestUrl]) =>
          new URL(String(requestUrl)).pathname.endsWith("/lookup.php"),
        ),
    ).toHaveLength(1);
  });

  it("ranks stronger intersections first and removes single matches", async () => {
    const listsByIngredient: Record<
      string,
      Array<{ idMeal: string; strMeal: string }>
    > = {
      Milk: [
        { idMeal: "all", strMeal: "All ingredients" },
        { idMeal: "milk-eggs", strMeal: "Milk and eggs" },
        { idMeal: "milk-cheese", strMeal: "Milk and cheese" },
        { idMeal: "milk-only", strMeal: "Milk only" },
      ],
      Eggs: [
        { idMeal: "all", strMeal: "All ingredients" },
        { idMeal: "milk-eggs", strMeal: "Milk and eggs" },
        { idMeal: "eggs-cheese", strMeal: "Eggs and cheese" },
        { idMeal: "eggs-only", strMeal: "Eggs only" },
      ],
      Cheese: [
        { idMeal: "all", strMeal: "All ingredients" },
        { idMeal: "milk-cheese", strMeal: "Milk and cheese" },
        { idMeal: "eggs-cheese", strMeal: "Eggs and cheese" },
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
        meals: [createMeal(mealId, mealId, [{ name: "Milk", measure: "1" }])],
      });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["Milk", "Eggs", "Cheese"],
      fetchImplementation,
    });

    expect(recipes.map((recipe) => recipe.label)).toEqual([
      "all",
      "milk-eggs",
      "milk-cheese",
      "eggs-cheese",
    ]);
  });

  it("round-robins non-intersecting results and caps the result at fifteen", async () => {
    const ingredientPrefixes: Record<string, string> = {
      Milk: "milk",
      Eggs: "eggs",
      Cheese: "cheese",
    };
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        const prefix =
          ingredientPrefixes[parsedUrl.searchParams.get("i") ?? ""] ?? "meal";
        return Response.json({
          meals: Array.from({ length: 8 }, (_, mealIndex) => ({
            idMeal: `${prefix}-${mealIndex + 1}`,
            strMeal: `${prefix}-${mealIndex + 1}`,
          })),
        });
      }

      const mealId = parsedUrl.searchParams.get("i") ?? "unknown";
      return Response.json({
        meals: [createMeal(mealId, mealId, [{ name: "Salt", measure: "1" }])],
      });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["Milk", "Eggs", "Cheese"],
      fetchImplementation,
    });

    expect(recipes.map((recipe) => recipe.label)).toEqual([
      "milk-1",
      "eggs-1",
      "cheese-1",
      "milk-2",
      "eggs-2",
      "cheese-2",
      "milk-3",
      "eggs-3",
      "cheese-3",
      "milk-4",
      "eggs-4",
      "cheese-4",
      "milk-5",
      "eggs-5",
      "cheese-5",
    ]);
  });

  it("returns a structured API error", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({}, { status: 429 }),
    ) as unknown as typeof fetch;

    await expect(
      searchRecipes({
        ingredients: ["milk"],
        fetchImplementation,
      }),
    ).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    } satisfies Partial<RecipeApiError>);
  });

  it("rejects an invalid ingredient count before calling the API", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;

    await expect(
      searchRecipes({
        ingredients: [],
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "invalid_ingredients" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
