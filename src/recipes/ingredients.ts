import Fuse from "fuse.js";

import { productDictionary } from "../data/catalog";
import type { PantryItem, ShoppingUnit } from "../domain/types";
import { normalizeProductName } from "../lib/parseShoppingInput";
import type {
  RankedRecipe,
  RecipeIngredient,
  RecipeIngredientMatch,
  RecipeIngredientReview,
  RecipeShoppingInput,
  RecipeSummary,
} from "./types";

const metricMeasureUnits: Readonly<Record<string, ShoppingUnit>> = {
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
};

const packageMeasures = new Set([
  "bag",
  "bags",
  "bottle",
  "bottles",
  "box",
  "boxes",
  "can",
  "cans",
  "container",
  "containers",
  "package",
  "packages",
  "pack",
  "packs",
  "packet",
  "packets",
]);

const pieceMeasures = new Set([
  "bunch",
  "bunches",
  "clove",
  "cloves",
  "head",
  "heads",
  "large",
  "medium",
  "piece",
  "pieces",
  "slice",
  "slices",
  "small",
  "stalk",
  "stalks",
  "unit",
  "units",
  "whole",
]);

const volumeMeasureMilliliters: Readonly<Record<string, number>> = {
  cup: 240,
  cups: 240,
  tablespoon: 15,
  tablespoons: 15,
  tbsp: 15,
  tbs: 15,
  teaspoon: 5,
  teaspoons: 5,
  tsp: 5,
  "fluid ounce": 29.57,
  "fluid ounces": 29.57,
  pint: 473.18,
  pints: 473.18,
  quart: 946.35,
  quarts: 946.35,
};

const massMeasureGrams: Readonly<Record<string, number>> = {
  ounce: 28.35,
  ounces: 28.35,
  oz: 28.35,
  pound: 453.59,
  pounds: 453.59,
  lb: 453.59,
  lbs: 453.59,
};

const normalizeMeasure = (measure: string | undefined): string =>
  measure
    ?.normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[.]/g, "")
    .trim() ?? "";

const roundQuantity = (quantity: number): number =>
  Math.round(quantity * 100) / 100;

const getSafeQuantity = (quantity: number): number =>
  Number.isFinite(quantity) && quantity > 0 ? roundQuantity(quantity) : 1;

const getCanonicalCatalogName = (value: string): string | null => {
  const catalogProduct = productDictionary[normalizeProductName(value)];

  return catalogProduct ? normalizeProductName(catalogProduct.name) : null;
};

export const canonicalizeRecipeProductName = (value: string): string => {
  const normalizedName = normalizeProductName(value);

  if (!normalizedName) {
    return "";
  }

  return getCanonicalCatalogName(normalizedName) ?? normalizedName;
};

export const getRecipeSearchIngredient = (value: string): string => {
  const normalizedName = normalizeProductName(value);

  if (!normalizedName) {
    return "";
  }

  return productDictionary[normalizedName]?.name ?? normalizedName;
};

const getPantryCanonicalName = (pantryItem: PantryItem): string =>
  canonicalizeRecipeProductName(pantryItem.canonicalName || pantryItem.name);

const isContainedMatch = (firstName: string, secondName: string): boolean => {
  const firstTokenCount = firstName.split(" ").length;
  const secondTokenCount = secondName.split(" ").length;

  if (firstTokenCount === 1 || secondTokenCount === 1) {
    return false;
  }

  return (
    firstName.includes(` ${secondName} `) ||
    firstName.startsWith(`${secondName} `) ||
    firstName.endsWith(` ${secondName}`) ||
    secondName.includes(` ${firstName} `) ||
    secondName.startsWith(`${firstName} `) ||
    secondName.endsWith(` ${firstName}`)
  );
};

const getProductTokenCount = (productName: string): number =>
  productName.split(/\s+/u).filter(Boolean).length;

export const matchRecipeIngredient = (
  ingredient: RecipeIngredient,
  pantryItems: PantryItem[],
): RecipeIngredientMatch | null => {
  const ingredientName = canonicalizeRecipeProductName(
    ingredient.food || ingredient.text,
  );

  if (!ingredientName || pantryItems.length === 0) {
    return null;
  }

  const pantryCandidates = pantryItems
    .map((pantryItem) => ({
      pantryItem,
      canonicalName: getPantryCanonicalName(pantryItem),
    }))
    .filter((candidate) => candidate.canonicalName);
  const exactMatch = pantryCandidates.find(
    (candidate) => candidate.canonicalName === ingredientName,
  );

  if (exactMatch) {
    return {
      pantryItem: exactMatch.pantryItem,
      score: 0,
      matchType: "exact",
    };
  }

  const containedMatch = pantryCandidates.find((candidate) =>
    isContainedMatch(candidate.canonicalName, ingredientName),
  );

  if (containedMatch) {
    return {
      pantryItem: containedMatch.pantryItem,
      score: 0.1,
      matchType: "contained",
    };
  }

  const fuzzyCandidates = pantryCandidates.filter(
    (candidate) =>
      getProductTokenCount(candidate.canonicalName) ===
      getProductTokenCount(ingredientName),
  );
  const fuzzyMatch = new Fuse(fuzzyCandidates, {
    keys: ["canonicalName"],
    includeScore: true,
    ignoreLocation: true,
    shouldSort: true,
    threshold: 0.22,
  }).search(ingredientName, { limit: 1 })[0];

  if (!fuzzyMatch || (fuzzyMatch.score ?? 1) > 0.22) {
    return null;
  }

  return {
    pantryItem: fuzzyMatch.item.pantryItem,
    score: fuzzyMatch.score ?? 0,
    matchType: "fuzzy",
  };
};

export const mapRecipeIngredientToShoppingInput = (
  ingredient: RecipeIngredient,
): RecipeShoppingInput => {
  const name = ingredient.food.trim() || ingredient.text.trim();
  const canonicalName = canonicalizeRecipeProductName(name);
  const normalizedMeasure = normalizeMeasure(ingredient.measure);
  const metricUnit = metricMeasureUnits[normalizedMeasure];

  if (metricUnit) {
    return {
      name,
      canonicalName,
      quantity: getSafeQuantity(ingredient.quantity),
      unit: metricUnit,
      sourceText: ingredient.text,
    };
  }

  if (packageMeasures.has(normalizedMeasure)) {
    return {
      name,
      canonicalName,
      quantity: getSafeQuantity(ingredient.quantity),
      unit: "pack",
      sourceText: ingredient.text,
    };
  }

  const shouldKeepPieceQuantity =
    !normalizedMeasure || pieceMeasures.has(normalizedMeasure);

  if (shouldKeepPieceQuantity) {
    return {
      name,
      canonicalName,
      quantity: getSafeQuantity(ingredient.quantity),
      unit: "pcs",
      sourceText: ingredient.text,
    };
  }

  if (Number.isFinite(ingredient.weight) && (ingredient.weight ?? 0) > 0) {
    return {
      name,
      canonicalName,
      quantity: getSafeQuantity(ingredient.weight ?? 1),
      unit: "g",
      sourceText: ingredient.text,
    };
  }

  const volumeMultiplier = volumeMeasureMilliliters[normalizedMeasure];

  if (volumeMultiplier) {
    return {
      name,
      canonicalName,
      quantity: getSafeQuantity(ingredient.quantity * volumeMultiplier),
      unit: "ml",
      sourceText: ingredient.text,
    };
  }

  const massMultiplier = massMeasureGrams[normalizedMeasure];

  if (massMultiplier) {
    return {
      name,
      canonicalName,
      quantity: getSafeQuantity(ingredient.quantity * massMultiplier),
      unit: "g",
      sourceText: ingredient.text,
    };
  }

  return {
    name,
    canonicalName,
    quantity: 1,
    unit: "pcs",
    sourceText: ingredient.text,
  };
};

export const deduplicateRecipeShoppingInputs = (
  inputs: RecipeShoppingInput[],
): RecipeShoppingInput[] => {
  const inputsByCanonicalName = new Map<string, RecipeShoppingInput>();

  for (const input of inputs) {
    const canonicalName =
      input.canonicalName || canonicalizeRecipeProductName(input.name);
    const existingInput = inputsByCanonicalName.get(canonicalName);

    if (!existingInput) {
      inputsByCanonicalName.set(canonicalName, {
        ...input,
        canonicalName,
      });
      continue;
    }

    if (existingInput.unit === input.unit) {
      inputsByCanonicalName.set(canonicalName, {
        ...existingInput,
        quantity: roundQuantity(existingInput.quantity + input.quantity),
        sourceText: [existingInput.sourceText, input.sourceText]
          .filter(Boolean)
          .join("; "),
      });
    }
  }

  return [...inputsByCanonicalName.values()];
};

export const buildRecipeIngredientReview = (
  recipe: RecipeSummary,
  pantryItems: PantryItem[],
): RecipeIngredientReview[] => {
  const reviewsByCanonicalName = new Map<string, RecipeIngredientReview>();

  for (const ingredient of recipe.ingredients) {
    const shoppingInput = mapRecipeIngredientToShoppingInput(ingredient);
    const existingReview = reviewsByCanonicalName.get(shoppingInput.canonicalName);

    if (existingReview) {
      if (existingReview.unit === shoppingInput.unit) {
        reviewsByCanonicalName.set(shoppingInput.canonicalName, {
          ...existingReview,
          quantity: roundQuantity(
            existingReview.quantity + shoppingInput.quantity,
          ),
          sourceText: [existingReview.sourceText, shoppingInput.sourceText]
            .filter(Boolean)
            .join("; "),
        });
      }
      continue;
    }

    const match = matchRecipeIngredient(ingredient, pantryItems);
    reviewsByCanonicalName.set(shoppingInput.canonicalName, {
      ...shoppingInput,
      ingredient,
      isMissing: !match,
      matchedPantryItemId: match?.pantryItem.id,
    });
  }

  return [...reviewsByCanonicalName.values()];
};

export const rankRecipesByPantry = (
  recipes: RecipeSummary[],
  pantryItems: PantryItem[],
): RankedRecipe[] => {
  const selectedPantryItems = [
    ...new Map(
      pantryItems.map((pantryItem) => [
        getPantryCanonicalName(pantryItem),
        pantryItem,
      ]),
    ).values(),
  ];

  return recipes
    .map((recipe) => {
      const ingredientReviews = buildRecipeIngredientReview(
        recipe,
        selectedPantryItems,
      );
      const matchedIngredientCount = ingredientReviews.filter(
        (review) => !review.isMissing,
      ).length;

      return {
        recipe,
        matchedIngredientCount,
        missingIngredientCount: ingredientReviews.filter(
          (review) => review.isMissing,
        ).length,
        coverage:
          ingredientReviews.length > 0
            ? matchedIngredientCount / ingredientReviews.length
            : 0,
      };
    })
    .sort((firstRecipe, secondRecipe) => {
      if (firstRecipe.coverage !== secondRecipe.coverage) {
        return secondRecipe.coverage - firstRecipe.coverage;
      }

      if (
        firstRecipe.missingIngredientCount !==
        secondRecipe.missingIngredientCount
      ) {
        return (
          firstRecipe.missingIngredientCount -
          secondRecipe.missingIngredientCount
        );
      }

      return firstRecipe.recipe.label.localeCompare(secondRecipe.recipe.label);
    });
};
