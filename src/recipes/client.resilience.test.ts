import { afterEach, describe, expect, it, vi } from "vitest";

import { searchRecipes } from "./client";

const createMeal = (
  mealId: string,
  mealName: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  idMeal: mealId,
  strMeal: mealName,
  strMealThumb: `https://www.themealdb.com/images/${mealId}.jpg`,
  strCategory: "Vegetarian",
  strArea: "Italian",
  strSource: `https://example.com/${mealId}`,
  strIngredient1: "Milk",
  strMeasure1: "200 ml",
  ...overrides,
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recipe client resilience", () => {
  it("keeps grouped results when one ingredient request fails", async () => {
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));
      const ingredient = parsedUrl.searchParams.get("i");

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        if (ingredient === "Cheese") {
          throw new TypeError("Network unavailable");
        }

        return Response.json({
          meals: [{ idMeal: "shared", strMeal: "Milk egg bake" }],
        });
      }

      return Response.json({ meals: [createMeal("shared", "Milk egg bake")] });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["Milk", "Eggs", "Cheese"],
      fetchImplementation,
    });

    expect(recipes.map((recipe) => recipe.label)).toEqual(["Milk egg bake"]);
    expect(
      vi
        .mocked(fetchImplementation)
        .mock.calls.filter(([requestUrl]) =>
          new URL(String(requestUrl)).pathname.endsWith("/filter.php"),
        ),
    ).toHaveLength(3);
  });

  it("returns successful recipe details when another lookup fails", async () => {
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        return Response.json({
          meals: [
            { idMeal: "1", strMeal: "First" },
            { idMeal: "2", strMeal: "Unavailable" },
            { idMeal: "3", strMeal: "Third" },
          ],
        });
      }

      const mealId = parsedUrl.searchParams.get("i") ?? "";

      if (mealId === "2") {
        return Response.json({}, { status: 503 });
      }

      return Response.json({ meals: [createMeal(mealId, `Meal ${mealId}`)] });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["Milk"],
      fetchImplementation,
    });

    expect(recipes.map((recipe) => recipe.label)).toEqual(["Meal 1", "Meal 3"]);
  });

  it("limits parallel recipe detail requests", async () => {
    let activeLookupCount = 0;
    let maximumActiveLookupCount = 0;
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        return Response.json({
          meals: Array.from({ length: 15 }, (_, mealIndex) => ({
            idMeal: String(mealIndex + 1),
            strMeal: `Meal ${mealIndex + 1}`,
          })),
        });
      }

      activeLookupCount += 1;
      maximumActiveLookupCount = Math.max(
        maximumActiveLookupCount,
        activeLookupCount,
      );
      await new Promise((resolve) => setTimeout(resolve, 2));
      activeLookupCount -= 1;
      const mealId = parsedUrl.searchParams.get("i") ?? "";
      return Response.json({ meals: [createMeal(mealId, `Meal ${mealId}`)] });
    }) as unknown as typeof fetch;

    const recipes = await searchRecipes({
      ingredients: ["Milk"],
      fetchImplementation,
    });

    expect(recipes).toHaveLength(15);
    expect(maximumActiveLookupCount).toBeGreaterThan(1);
    expect(maximumActiveLookupCount).toBeLessThanOrEqual(4);
  });

  it("times out a request even when fetch does not handle abort", async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn(
      () => new Promise<Response>(() => undefined),
    ) as unknown as typeof fetch;
    const requestPromise = searchRecipes({
      ingredients: ["Milk"],
      fetchImplementation,
    });
    const rejectionExpectation = expect(requestPromise).rejects.toMatchObject({
      status: 408,
      code: "request_timeout",
    });

    await vi.advanceTimersByTimeAsync(12_000);
    await rejectionExpectation;
  });

  it("propagates caller cancellation", async () => {
    const abortController = new AbortController();
    const fetchImplementation = vi.fn(
      () => new Promise<Response>(() => undefined),
    ) as unknown as typeof fetch;
    const requestPromise = searchRecipes({
      ingredients: ["Milk"],
      signal: abortController.signal,
      fetchImplementation,
    });
    const rejectionExpectation = expect(requestPromise).rejects.toMatchObject({
      name: "AbortError",
    });

    abortController.abort();
    await rejectionExpectation;
  });

  it("rejects unsafe API origins before sending a request", async () => {
    const fetchImplementation = vi.fn() as unknown as typeof fetch;

    await expect(
      searchRecipes({
        ingredients: ["Milk"],
        apiOrigin: "javascript:alert(1)",
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "invalid_configuration" });
    await expect(
      searchRecipes({
        ingredients: ["Milk"],
        apiOrigin: "http://recipes.example",
        fetchImplementation,
      }),
    ).rejects.toMatchObject({ code: "invalid_configuration" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("reuses successful responses for identical searches", async () => {
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        return Response.json({ meals: [{ idMeal: "1", strMeal: "Cached" }] });
      }

      return Response.json({ meals: [createMeal("1", "Cached")] });
    }) as unknown as typeof fetch;

    await searchRecipes({ ingredients: ["Milk"], fetchImplementation });
    await searchRecipes({ ingredients: ["Milk"], fetchImplementation });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetchImplementation).mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  });

  it("removes unsafe external recipe and image URLs", async () => {
    const fetchImplementation = vi.fn(async (requestUrl: URL | RequestInfo) => {
      const parsedUrl = new URL(String(requestUrl));

      if (parsedUrl.pathname.endsWith("/filter.php")) {
        return Response.json({ meals: [{ idMeal: "1", strMeal: "Safe meal" }] });
      }

      return Response.json({
        meals: [
          createMeal("1", "Safe meal", {
            strMealThumb: "data:image/svg+xml,<svg></svg>",
            strSource: "https://user:password@example.com/recipe",
          }),
        ],
      });
    }) as unknown as typeof fetch;

    const [recipe] = await searchRecipes({
      ingredients: ["Milk"],
      fetchImplementation,
    });

    expect(recipe.image).toBeUndefined();
    expect(recipe.url).toBe("https://www.themealdb.com/meal/1");
  });
});
