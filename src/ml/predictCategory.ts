import {
  encodeProductName,
  getCategoryModelTensorFlow,
  getLoadedCategoryModel,
  normalizeProductName,
} from "./categoryModel";
import { PRODUCT_CATEGORY_IDS, type CategoryPrediction } from "./types";

export type PredictCategoryOptions = {
  fallbackCategoryId?: string | null;
  minimumConfidence?: number;
};

const DEFAULT_MINIMUM_CONFIDENCE = 0.52;

export const predictCategory = async (
  productName: string,
  options: PredictCategoryOptions = {},
): Promise<CategoryPrediction> => {
  const normalizedInput = normalizeProductName(productName);
  const fallbackCategoryId = options.fallbackCategoryId ?? null;

  if (!normalizedInput) {
    return {
      categoryId: fallbackCategoryId,
      confidence: null,
      source: fallbackCategoryId ? "fallback" : "unavailable",
      normalizedInput,
    };
  }

  const model = getLoadedCategoryModel();

  if (!model) {
    return {
      categoryId: fallbackCategoryId,
      confidence: null,
      source: fallbackCategoryId ? "fallback" : "unavailable",
      normalizedInput,
    };
  }

  try {
    const tensorflow = await getCategoryModelTensorFlow();

    if (!tensorflow) {
      return {
        categoryId: fallbackCategoryId,
        confidence: null,
        source: fallbackCategoryId ? "fallback" : "unavailable",
        normalizedInput,
      };
    }

    const inputTensor = tensorflow.tensor2d([encodeProductName(normalizedInput)]);

    try {
      const predictionResult = model.predict(inputTensor);

      if (Array.isArray(predictionResult)) {
        predictionResult.forEach((predictionTensor) => predictionTensor.dispose());

        return {
          categoryId: fallbackCategoryId,
          confidence: null,
          source: fallbackCategoryId ? "fallback" : "unavailable",
          normalizedInput,
        };
      }

      const predictionTensor = predictionResult;

      try {
        const probabilities = Array.from(
          await predictionTensor.data(),
          (value) => Number(value),
        );
        const highestProbability = Math.max(...probabilities);
        const highestProbabilityIndex = probabilities.indexOf(highestProbability);
        const minimumConfidence =
          options.minimumConfidence ?? DEFAULT_MINIMUM_CONFIDENCE;

        if (highestProbability < minimumConfidence) {
          return {
            categoryId: fallbackCategoryId,
            confidence: highestProbability,
            source: fallbackCategoryId ? "fallback" : "unavailable",
            normalizedInput,
          };
        }

        return {
          categoryId: PRODUCT_CATEGORY_IDS[highestProbabilityIndex] ?? fallbackCategoryId,
          confidence: highestProbability,
          source: "model",
          normalizedInput,
        };
      } finally {
        predictionTensor.dispose();
      }
    } finally {
      inputTensor.dispose();
    }
  } catch {
    return {
      categoryId: fallbackCategoryId,
      confidence: null,
      source: fallbackCategoryId ? "fallback" : "unavailable",
      normalizedInput,
    };
  }
};
