import { getRecipeSearchIngredient } from "./ingredients";
import type {
  RecipeIngredient,
  RecipeSearchRequest,
  RecipeSummary,
} from "./types";

const defaultMealDbApiKey = "1";
const defaultMealDbOrigin = "https://www.themealdb.com";
const maximumRecipeCandidates = 15;
const maximumConcurrentRequests = 4;
const requestTimeoutMilliseconds = 12_000;
const filterCacheLifetimeMilliseconds = 60_000;
const recipeCacheLifetimeMilliseconds = 10 * 60_000;
const maximumCachedResponses = 100;

interface CachedJsonResponse {
  expiresAt: number;
  payload: unknown;
}

interface MealDbListItem {
  idMeal?: unknown;
  strMeal?: unknown;
  strMealThumb?: unknown;
}

type MealDbMeal = Record<string, unknown>;

interface MealCandidate {
  mealId: string;
  ingredientIndexes: number[];
  ingredientRanks: number[];
  firstSeenOrder: number;
}

const responseCacheByFetchImplementation = new WeakMap<
  typeof fetch,
  Map<string, CachedJsonResponse>
>();

export class RecipeApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "RecipeApiError";
    this.status = status;
    this.code = code;
  }
}

const getString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const getConfiguredApiKey = (): string =>
  import.meta.env.VITE_MEALDB_API_KEY?.trim() || defaultMealDbApiKey;

const isLocalHostname = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]";

const getApiBaseUrl = (apiKey: string, apiOrigin: string): URL => {
  const normalizedApiKey = apiKey.trim();

  if (!normalizedApiKey || normalizedApiKey.length > 200) {
    throw new RecipeApiError(
      "Recipe service is not configured correctly.",
      400,
      "invalid_configuration",
    );
  }

  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(apiOrigin.trim());
  } catch {
    throw new RecipeApiError(
      "Recipe service is not configured correctly.",
      400,
      "invalid_configuration",
    );
  }

  if (
    (parsedOrigin.protocol !== "https:" &&
      !(parsedOrigin.protocol === "http:" && isLocalHostname(parsedOrigin.hostname))) ||
    parsedOrigin.username ||
    parsedOrigin.password
  ) {
    throw new RecipeApiError(
      "Recipe service is not configured correctly.",
      400,
      "invalid_configuration",
    );
  }

  parsedOrigin.hash = "";
  parsedOrigin.search = "";
  parsedOrigin.pathname = `/api/json/v1/${encodeURIComponent(normalizedApiKey)}/`;
  return parsedOrigin;
};

const getApiRequestUrl = (
  apiBaseUrl: URL,
  endpoint: "filter.php" | "lookup.php",
  searchValue: string,
): string => {
  const requestUrl = new URL(endpoint, apiBaseUrl);
  requestUrl.searchParams.set("i", searchValue);
  return requestUrl.toString();
};

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (!signal?.aborted) {
    return;
  }

  throw (
    signal.reason ??
    new DOMException("The recipe request was cancelled.", "AbortError")
  );
};

const getCachedJsonResponse = (
  url: string,
  fetchImplementation: typeof fetch,
): unknown | undefined => {
  const responseCache = responseCacheByFetchImplementation.get(fetchImplementation);
  const cachedResponse = responseCache?.get(url);

  if (!cachedResponse) {
    return undefined;
  }

  if (cachedResponse.expiresAt <= Date.now()) {
    responseCache?.delete(url);
    return undefined;
  }

  return cachedResponse.payload;
};

const cacheJsonResponse = (
  url: string,
  payload: unknown,
  cacheLifetimeMilliseconds: number,
  fetchImplementation: typeof fetch,
): void => {
  const responseCache =
    responseCacheByFetchImplementation.get(fetchImplementation) ?? new Map();

  if (!responseCacheByFetchImplementation.has(fetchImplementation)) {
    responseCacheByFetchImplementation.set(fetchImplementation, responseCache);
  }

  if (responseCache.has(url)) {
    responseCache.delete(url);
  }

  responseCache.set(url, {
    expiresAt: Date.now() + cacheLifetimeMilliseconds,
    payload,
  });

  while (responseCache.size > maximumCachedResponses) {
    const oldestCacheKey = responseCache.keys().next().value;

    if (oldestCacheKey === undefined) {
      return;
    }

    responseCache.delete(oldestCacheKey);
  }
};

const fetchJson = async (
  url: string,
  signal: AbortSignal | undefined,
  fetchImplementation: typeof fetch,
  cacheLifetimeMilliseconds: number,
): Promise<unknown> => {
  throwIfAborted(signal);

  const cachedPayload = getCachedJsonResponse(url, fetchImplementation);

  if (cachedPayload !== undefined) {
    return cachedPayload;
  }

  const requestController = new AbortController();
  let timeoutIdentifier: ReturnType<typeof setTimeout> | undefined;
  let handleExternalAbort: (() => void) | undefined;

  const cancellationPromise = new Promise<never>((_, reject) => {
    timeoutIdentifier = setTimeout(() => {
      const timeoutError = new RecipeApiError(
        "Recipe search took too long. Please try again.",
        408,
        "request_timeout",
      );
      requestController.abort(timeoutError);
      reject(timeoutError);
    }, requestTimeoutMilliseconds);

    if (signal) {
      handleExternalAbort = () => {
        const abortReason =
          signal.reason ??
          new DOMException("The recipe request was cancelled.", "AbortError");
        requestController.abort(abortReason);
        reject(abortReason);
      };
      signal.addEventListener("abort", handleExternalAbort, { once: true });
    }
  });

  try {
    const response = await Promise.race([
      fetchImplementation(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: requestController.signal,
      }),
      cancellationPromise,
    ]);

    if (!response.ok) {
      throw new RecipeApiError(
        "Recipe search is temporarily unavailable.",
        response.status,
        response.status === 429 ? "rate_limited" : "recipe_api_error",
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new RecipeApiError(
        "Recipe service returned an invalid response.",
        502,
        "invalid_response",
      );
    }

    throwIfAborted(signal);
    cacheJsonResponse(
      url,
      payload,
      cacheLifetimeMilliseconds,
      fetchImplementation,
    );
    return payload;
  } catch (error) {
    if (signal?.aborted) {
      throwIfAborted(signal);
    }

    if (error instanceof RecipeApiError) {
      throw error;
    }

    throw new RecipeApiError(
      "Recipe search is temporarily unavailable.",
      0,
      "network_error",
    );
  } finally {
    if (timeoutIdentifier !== undefined) {
      clearTimeout(timeoutIdentifier);
    }

    if (signal && handleExternalAbort) {
      signal.removeEventListener("abort", handleExternalAbort);
    }
  }
};

const mapSettledWithConcurrency = async <Item, Result>(
  items: readonly Item[],
  mapper: (item: Item) => Promise<Result>,
): Promise<PromiseSettledResult<Result>[]> => {
  const settledResults = new Array<PromiseSettledResult<Result>>(items.length);
  let nextItemIndex = 0;
  const workerCount = Math.min(maximumConcurrentRequests, items.length);

  const runWorker = async (): Promise<void> => {
    while (nextItemIndex < items.length) {
      const itemIndex = nextItemIndex;
      nextItemIndex += 1;

      try {
        settledResults[itemIndex] = {
          status: "fulfilled",
          value: await mapper(items[itemIndex]),
        };
      } catch (error) {
        settledResults[itemIndex] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return settledResults;
};

const getFirstRequestError = <Result>(
  results: PromiseSettledResult<Result>[],
): unknown =>
  results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  )?.reason;

const isMealDbListItem = (value: unknown): value is MealDbListItem => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as MealDbListItem;
  return Boolean(getString(candidate.idMeal) && getString(candidate.strMeal));
};

const readMealList = (payload: unknown): MealDbListItem[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const meals = (payload as { meals?: unknown }).meals;
  return Array.isArray(meals) ? meals.filter(isMealDbListItem) : [];
};

const readMealDetails = (payload: unknown): MealDbMeal | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const meals = (payload as { meals?: unknown }).meals;

  if (!Array.isArray(meals) || !meals[0] || typeof meals[0] !== "object") {
    return null;
  }

  return meals[0] as MealDbMeal;
};

const fractionValues: Readonly<Record<string, number>> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const parseNumericToken = (token: string): number | null => {
  if (fractionValues[token] !== undefined) {
    return fractionValues[token];
  }

  if (/^\d+\/\d+$/u.test(token)) {
    const [numerator, denominator] = token.split("/").map(Number);
    return denominator > 0 ? numerator / denominator : null;
  }

  const numericValue = Number(token.replace(",", "."));
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
};

const parseMealMeasure = (
  value: string,
): { quantity: number; measure?: string } => {
  const normalizedValue = value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[–—]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();

  if (!normalizedValue) {
    return { quantity: 1 };
  }

  const compactMeasureMatch = normalizedValue.match(
    /^(\d+(?:[.,]\d+)?|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞])([a-z]+)(?:\b|\/)/u,
  );

  if (compactMeasureMatch) {
    const compactQuantity = parseNumericToken(compactMeasureMatch[1]);

    if (compactQuantity !== null) {
      return {
        quantity: compactQuantity,
        measure: compactMeasureMatch[2],
      };
    }
  }

  const tokens = normalizedValue.split(" ");
  const firstQuantity = parseNumericToken(tokens[0]);
  const secondQuantity = tokens[1] ? parseNumericToken(tokens[1]) : null;

  if (firstQuantity === null) {
    return { quantity: 1, measure: normalizedValue };
  }

  const quantity = firstQuantity + (secondQuantity ?? 0);
  const measureStartIndex = secondQuantity === null ? 1 : 2;
  const measure = tokens.slice(measureStartIndex).join(" ").trim();

  return {
    quantity,
    measure: measure || undefined,
  };
};

const getMealIngredients = (meal: MealDbMeal): RecipeIngredient[] => {
  const ingredients: RecipeIngredient[] = [];

  for (let ingredientIndex = 1; ingredientIndex <= 20; ingredientIndex += 1) {
    const food = getString(meal[`strIngredient${ingredientIndex}`]);

    if (!food) {
      continue;
    }

    const sourceMeasure = getString(meal[`strMeasure${ingredientIndex}`]);
    const { quantity, measure } = parseMealMeasure(sourceMeasure);
    ingredients.push({
      text: [sourceMeasure, food].filter(Boolean).join(" "),
      quantity,
      measure,
      food,
    });
  }

  return ingredients;
};

const getSafeExternalUrl = (value: unknown, fallbackUrl: string): string => {
  const candidateUrl = getString(value);

  if (!candidateUrl) {
    return fallbackUrl;
  }

  try {
    const parsedUrl = new URL(candidateUrl);
    const hasSafeProtocol = parsedUrl.protocol === "https:";

    return hasSafeProtocol && !parsedUrl.username && !parsedUrl.password
      ? parsedUrl.toString()
      : fallbackUrl;
  } catch {
    return fallbackUrl;
  }
};

const mapMealToRecipe = (meal: MealDbMeal): RecipeSummary | null => {
  const mealId = getString(meal.idMeal);
  const label = getString(meal.strMeal);

  if (!mealId || !label) {
    return null;
  }

  const ingredients = getMealIngredients(meal);
  const category = getString(meal.strCategory);
  const area = getString(meal.strArea);
  const fallbackUrl = `${defaultMealDbOrigin}/meal/${encodeURIComponent(mealId)}`;
  const imageUrl = getSafeExternalUrl(meal.strMealThumb, "");

  return {
    uri: `themealdb:${mealId}`,
    label,
    image: imageUrl || undefined,
    source: area || category || "Recipe",
    url: getSafeExternalUrl(meal.strSource, fallbackUrl),
    yield: 0,
    dietLabels: category.toLocaleLowerCase() === "vegetarian" ? ["Vegetarian"] : [],
    healthLabels: [],
    cautions: [],
    ingredientLines: ingredients.map((ingredient) => ingredient.text),
    ingredients,
    calories: 0,
    totalTime: 0,
    cuisineType: area ? [area] : [],
    mealType: [],
    dishType: category ? [category] : [],
  };
};

const compareMealCandidates = (
  firstCandidate: MealCandidate,
  secondCandidate: MealCandidate,
): number => {
  const firstAverageRank =
    firstCandidate.ingredientRanks.reduce(
      (rankTotal, ingredientRank) => rankTotal + ingredientRank,
      0,
    ) / firstCandidate.ingredientRanks.length;
  const secondAverageRank =
    secondCandidate.ingredientRanks.reduce(
      (rankTotal, ingredientRank) => rankTotal + ingredientRank,
      0,
    ) / secondCandidate.ingredientRanks.length;

  if (firstAverageRank !== secondAverageRank) {
    return firstAverageRank - secondAverageRank;
  }

  const firstWorstRank = Math.max(...firstCandidate.ingredientRanks);
  const secondWorstRank = Math.max(...secondCandidate.ingredientRanks);

  if (firstWorstRank !== secondWorstRank) {
    return firstWorstRank - secondWorstRank;
  }

  if (firstCandidate.firstSeenOrder !== secondCandidate.firstSeenOrder) {
    return firstCandidate.firstSeenOrder - secondCandidate.firstSeenOrder;
  }

  return firstCandidate.mealId.localeCompare(secondCandidate.mealId);
};

const orderCandidatesForDiversity = (
  candidates: MealCandidate[],
): MealCandidate[] => {
  const candidatesByIngredientGroup = new Map<string, MealCandidate[]>();

  for (const candidate of candidates) {
    const ingredientGroup = candidate.ingredientIndexes.join(",");
    const groupedCandidates =
      candidatesByIngredientGroup.get(ingredientGroup) ?? [];
    groupedCandidates.push(candidate);
    candidatesByIngredientGroup.set(ingredientGroup, groupedCandidates);
  }

  const ingredientGroups = [...candidatesByIngredientGroup.entries()]
    .map(([ingredientGroup, groupedCandidates]) => ({
      ingredientGroup,
      candidates: groupedCandidates.sort(compareMealCandidates),
    }))
    .sort((firstGroup, secondGroup) => {
      const candidateComparison = compareMealCandidates(
        firstGroup.candidates[0],
        secondGroup.candidates[0],
      );

      return (
        candidateComparison ||
        firstGroup.ingredientGroup.localeCompare(secondGroup.ingredientGroup)
      );
    });
  const orderedCandidates: MealCandidate[] = [];
  const largestGroupSize = Math.max(
    ...ingredientGroups.map((ingredientGroup) => ingredientGroup.candidates.length),
  );

  for (let groupIndex = 0; groupIndex < largestGroupSize; groupIndex += 1) {
    for (const ingredientGroup of ingredientGroups) {
      const candidate = ingredientGroup.candidates[groupIndex];

      if (candidate) {
        orderedCandidates.push(candidate);
      }
    }
  }

  return orderedCandidates;
};

const getCandidateMealIds = (mealLists: MealDbListItem[][]): string[] => {
  const candidatesById = new Map<string, MealCandidate>();
  let insertionOrder = 0;

  mealLists.forEach((mealList, ingredientIndex) => {
    const ingredientMealIds = new Set<string>();

    mealList.forEach((candidate, ingredientRank) => {
      const mealId = getString(candidate?.idMeal);

      if (!mealId || ingredientMealIds.has(mealId)) {
        return;
      }

      ingredientMealIds.add(mealId);
      const existingCandidate = candidatesById.get(mealId);

      if (existingCandidate) {
        existingCandidate.ingredientIndexes.push(ingredientIndex);
        existingCandidate.ingredientRanks.push(ingredientRank);
        return;
      }

      candidatesById.set(mealId, {
        mealId,
        ingredientIndexes: [ingredientIndex],
        ingredientRanks: [ingredientRank],
        firstSeenOrder: insertionOrder,
      });
      insertionOrder += 1;
    });
  });

  const candidates = [...candidatesById.values()];
  const hasIngredientIntersection =
    mealLists.length > 1 &&
    candidates.some((candidate) => candidate.ingredientIndexes.length >= 2);
  const eligibleCandidates = hasIngredientIntersection
    ? candidates.filter((candidate) => candidate.ingredientIndexes.length >= 2)
    : candidates;
  const matchCounts = [
    ...new Set(
      eligibleCandidates.map((candidate) => candidate.ingredientIndexes.length),
    ),
  ].sort((firstMatchCount, secondMatchCount) =>
    secondMatchCount - firstMatchCount,
  );
  const rankedCandidates = matchCounts.flatMap((matchCount) =>
    orderCandidatesForDiversity(
      eligibleCandidates.filter(
        (candidate) => candidate.ingredientIndexes.length === matchCount,
      ),
    ),
  );

  return rankedCandidates
    .slice(0, maximumRecipeCandidates)
    .map((candidate) => candidate.mealId);
};

export const searchRecipes = async ({
  ingredients,
  signal,
  apiKey = getConfiguredApiKey(),
  apiOrigin = defaultMealDbOrigin,
  fetchImplementation = fetch,
}: RecipeSearchRequest): Promise<RecipeSummary[]> => {
  const uniqueIngredients = [
    ...new Map(
      ingredients
        .map(getRecipeSearchIngredient)
        .map((ingredient) => ingredient.trim())
        .filter(Boolean)
        .map((ingredient) => [ingredient.toLocaleLowerCase(), ingredient]),
    ).values(),
  ];

  if (
    uniqueIngredients.length < 1 ||
    uniqueIngredients.length > 5 ||
    uniqueIngredients.some((ingredient) => ingredient.length > 100)
  ) {
    throw new RecipeApiError(
      "Choose between one and five ingredients.",
      400,
      "invalid_ingredients",
    );
  }

  const apiBaseUrl = getApiBaseUrl(apiKey, apiOrigin);
  const mealListResults = await mapSettledWithConcurrency(
    uniqueIngredients,
    async (ingredient) => {
      const payload = await fetchJson(
        getApiRequestUrl(apiBaseUrl, "filter.php", ingredient),
        signal,
        fetchImplementation,
        filterCacheLifetimeMilliseconds,
      );
      return readMealList(payload);
    },
  );
  throwIfAborted(signal);

  const mealLists = mealListResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  if (mealLists.length === 0) {
    throw getFirstRequestError(mealListResults);
  }

  const candidateMealIds = getCandidateMealIds(mealLists);

  if (candidateMealIds.length === 0) {
    return [];
  }

  const recipeResults = await mapSettledWithConcurrency(
    candidateMealIds,
    async (mealId) => {
      const payload = await fetchJson(
        getApiRequestUrl(apiBaseUrl, "lookup.php", mealId),
        signal,
        fetchImplementation,
        recipeCacheLifetimeMilliseconds,
      );
      const meal = readMealDetails(payload);
      return meal ? mapMealToRecipe(meal) : null;
    },
  );
  throwIfAborted(signal);

  const recipes = recipeResults.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );

  if (
    recipes.length === 0 &&
    recipeResults.every((result) => result.status === "rejected")
  ) {
    throw getFirstRequestError(recipeResults);
  }

  return recipes;
};
