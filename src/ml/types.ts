export const PRODUCT_CATEGORY_IDS = [
  "vegetables",
  "fruits",
  "dairy",
  "meat",
  "fish",
  "grains",
  "pasta",
  "bread",
  "drinks",
  "sweets",
  "frozen",
  "canned",
  "household",
  "hygiene",
  "eggs",
  "other",
] as const;

export type ProductCategoryId = (typeof PRODUCT_CATEGORY_IDS)[number];

export type CategoryTrainingExample = {
  input: string;
  categoryId: ProductCategoryId | string;
};

export type CategoryModelState =
  | "idle"
  | "loading"
  | "training"
  | "ready"
  | "unavailable"
  | "error";

export type CategoryModelStatus = {
  state: CategoryModelState;
  isReady: boolean;
  source: "memory" | "indexeddb" | "trained" | "none";
  lastTrainedAt?: number;
  message?: string;
};

export type CategoryModelOperationResult = {
  ok: boolean;
  status: CategoryModelStatus;
  reason?: string;
};

export type CategoryPrediction = {
  categoryId: string | null;
  confidence: number | null;
  source: "model" | "fallback" | "unavailable";
  normalizedInput: string;
};

export type InitCategoryModelOptions = {
  background?: boolean;
  trainingExamples?: readonly CategoryTrainingExample[];
};

export type TrainCategoryModelOptions = {
  epochs?: number;
  save?: boolean;
};
