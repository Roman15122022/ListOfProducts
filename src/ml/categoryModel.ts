import type { LayersModel } from "@tensorflow/tfjs";

import { mockTrainingData } from "./mockTrainingData";
import {
  PRODUCT_CATEGORY_IDS,
  type CategoryModelOperationResult,
  type CategoryModelStatus,
  type CategoryTrainingExample,
  type InitCategoryModelOptions,
  type TrainCategoryModelOptions,
} from "./types";

type TensorFlowModule = typeof import("@tensorflow/tfjs");

const MODEL_STORAGE_URL = "indexeddb://smart-shopping-list-category-model";
const MODEL_METADATA_KEY = "smart-shopping-list-category-model-metadata";
const CHARACTER_VOCABULARY = " абвгдеёжзийклмнопрстуфхцчшщьыъэюяіїєґabcdefghijklmnopqrstuvwxyz0123456789";
const DEFAULT_EPOCHS = 36;
const MIN_TRAINING_EXAMPLES = 24;

let tensorflowModulePromise: Promise<TensorFlowModule | null> | null = null;
let categoryModel: LayersModel | null = null;
let currentStatus: CategoryModelStatus = {
  state: "idle",
  isReady: false,
  source: "none",
};
let activeTrainingTask: Promise<CategoryModelOperationResult> | null = null;

const createResult = (
  ok: boolean,
  reason?: string,
): CategoryModelOperationResult => ({
  ok,
  status: getCategoryModelStatus(),
  reason,
});

const updateStatus = (status: CategoryModelStatus): void => {
  currentStatus = status;
};

const getTensorFlowModule = async (): Promise<TensorFlowModule | null> => {
  if (!tensorflowModulePromise) {
    tensorflowModulePromise = import("@tensorflow/tfjs").catch(() => null);
  }

  return tensorflowModulePromise;
};

const getPersistedMetadata = (): { lastTrainedAt?: number } => {
  try {
    const serializedMetadata = globalThis.localStorage?.getItem(MODEL_METADATA_KEY);

    if (!serializedMetadata) {
      return {};
    }

    const metadata = JSON.parse(serializedMetadata) as { lastTrainedAt?: unknown };

    return typeof metadata.lastTrainedAt === "number"
      ? { lastTrainedAt: metadata.lastTrainedAt }
      : {};
  } catch {
    return {};
  }
};

const saveMetadata = (lastTrainedAt: number): void => {
  try {
    globalThis.localStorage?.setItem(
      MODEL_METADATA_KEY,
      JSON.stringify({ lastTrainedAt }),
    );
  } catch {
    return;
  }
};

const hasIndexedDb = (): boolean => {
  try {
    return typeof globalThis.indexedDB !== "undefined";
  } catch {
    return false;
  }
};

const isUsableCategoryId = (categoryId: string): boolean =>
  PRODUCT_CATEGORY_IDS.includes(categoryId as (typeof PRODUCT_CATEGORY_IDS)[number]);

const normalizeTrainingExamples = (
  examples: readonly CategoryTrainingExample[],
): CategoryTrainingExample[] => {
  const normalizedExamples: CategoryTrainingExample[] = [];

  for (const trainingExample of examples) {
    if (
      !trainingExample ||
      typeof trainingExample.input !== "string" ||
      typeof trainingExample.categoryId !== "string"
    ) {
      continue;
    }

    const input = normalizeProductName(trainingExample.input);

    if (input.length > 0 && isUsableCategoryId(trainingExample.categoryId)) {
      normalizedExamples.push({
        input,
        categoryId: trainingExample.categoryId,
      });
    }
  }

  return normalizedExamples;
};

const createModel = (tensorflow: TensorFlowModule): LayersModel => {
  const model = tensorflow.sequential();

  model.add(
    tensorflow.layers.dense({
      inputShape: [CHARACTER_VOCABULARY.length],
      units: 32,
      activation: "relu",
    }),
  );
  model.add(tensorflow.layers.dropout({ rate: 0.08 }));
  model.add(
    tensorflow.layers.dense({
      units: PRODUCT_CATEGORY_IDS.length,
      activation: "softmax",
    }),
  );
  model.compile({
    optimizer: tensorflow.train.adam(0.02),
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  });

  return model;
};

const runDuringIdleTime = (callback: () => void): void => {
  const idleCallback = (
    globalThis as typeof globalThis & {
      requestIdleCallback?: (idleCallback: () => void) => number;
    }
  ).requestIdleCallback;

  if (idleCallback) {
    idleCallback(callback);
    return;
  }

  globalThis.setTimeout(callback, 0);
};

const loadSavedModel = async (): Promise<CategoryModelOperationResult> => {
  if (categoryModel) {
    updateStatus({
      state: "ready",
      isReady: true,
      source: "memory",
      ...getPersistedMetadata(),
    });
    return createResult(true);
  }

  if (!hasIndexedDb()) {
    updateStatus({
      state: "unavailable",
      isReady: false,
      source: "none",
      message: "IndexedDB is unavailable.",
    });
    return createResult(false, "indexeddb_unavailable");
  }

  const tensorflow = await getTensorFlowModule();

  if (!tensorflow) {
    updateStatus({
      state: "unavailable",
      isReady: false,
      source: "none",
      message: "TensorFlow.js is unavailable.",
    });
    return createResult(false, "tensorflow_unavailable");
  }

  updateStatus({ state: "loading", isReady: false, source: "none" });

  try {
    categoryModel = await tensorflow.loadLayersModel(MODEL_STORAGE_URL);
    updateStatus({
      state: "ready",
      isReady: true,
      source: "indexeddb",
      ...getPersistedMetadata(),
    });
    return createResult(true);
  } catch {
    updateStatus({ state: "idle", isReady: false, source: "none" });
    return createResult(false, "model_not_found");
  }
};

export const saveCategoryModel = async (): Promise<CategoryModelOperationResult> => {
  try {
    if (!categoryModel) {
      return createResult(false, "model_unavailable");
    }

    if (!hasIndexedDb()) {
      return createResult(false, "indexeddb_unavailable");
    }

    await categoryModel.save(MODEL_STORAGE_URL);
    return createResult(true);
  } catch {
    return createResult(false, "model_not_persisted");
  }
};

const trainModel = async (
  examples: readonly CategoryTrainingExample[],
  options: TrainCategoryModelOptions = {},
): Promise<CategoryModelOperationResult> => {
  const tensorflow = await getTensorFlowModule();

  if (!tensorflow) {
    updateStatus({
      state: "unavailable",
      isReady: false,
      source: "none",
      message: "TensorFlow.js is unavailable.",
    });
    return createResult(false, "tensorflow_unavailable");
  }

  const trainingExamples = normalizeTrainingExamples(examples);

  if (trainingExamples.length < MIN_TRAINING_EXAMPLES) {
    return createResult(false, "not_enough_training_examples");
  }

  const encodedInputs = trainingExamples.map(({ input }) => encodeProductName(input));
  const labels = trainingExamples.map(({ categoryId }) =>
    PRODUCT_CATEGORY_IDS.indexOf(
      categoryId as (typeof PRODUCT_CATEGORY_IDS)[number],
    ),
  );
  const inputTensor = tensorflow.tensor2d(encodedInputs, [
    encodedInputs.length,
    CHARACTER_VOCABULARY.length,
  ]);
  const labelTensor = tensorflow.oneHot(
    tensorflow.tensor1d(labels, "int32"),
    PRODUCT_CATEGORY_IDS.length,
  );
  const previousModel = categoryModel;
  const nextModel = createModel(tensorflow);

  updateStatus({ state: "training", isReady: false, source: "none" });

  try {
    await nextModel.fit(inputTensor, labelTensor, {
      batchSize: Math.min(24, trainingExamples.length),
      epochs: options.epochs ?? DEFAULT_EPOCHS,
      shuffle: true,
      callbacks: {
        onEpochEnd: async () => {
          await tensorflow.nextFrame();
        },
      },
    });

    categoryModel = nextModel;
    previousModel?.dispose();

    const lastTrainedAt = Date.now();
    saveMetadata(lastTrainedAt);
    updateStatus({
      state: "ready",
      isReady: true,
      source: "trained",
      lastTrainedAt,
    });

    if (options.save !== false) {
      const savedModel = await saveCategoryModel();

      if (!savedModel.ok) {
        return createResult(true, savedModel.reason);
      }
    }

    return createResult(true);
  } catch {
    nextModel.dispose();
    categoryModel = previousModel;
    updateStatus({
      state: previousModel ? "ready" : "error",
      isReady: Boolean(previousModel),
      source: previousModel ? "memory" : "none",
      message: "Model training failed.",
      ...getPersistedMetadata(),
    });
    return createResult(false, "training_failed");
  } finally {
    inputTensor.dispose();
    labelTensor.dispose();
  }
};

export const normalizeProductName = (productName: string): string =>
  (typeof productName === "string" ? productName : "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/ё/g, "е")
    .replace(/[’'`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const encodeProductName = (productName: string): number[] => {
  const encodedCharacters = Array<number>(CHARACTER_VOCABULARY.length).fill(0);
  const normalizedInput = normalizeProductName(productName);

  for (const character of normalizedInput) {
    const characterIndex = CHARACTER_VOCABULARY.indexOf(character);

    if (characterIndex >= 0) {
      encodedCharacters[characterIndex] += 1;
    }
  }

  const inputLength = normalizedInput.length || 1;

  return encodedCharacters.map((value) => value / inputLength);
};

export const getCategoryModelStatus = (): CategoryModelStatus => ({
  ...currentStatus,
});

export const getCategoryModelTensorFlow = async (): Promise<TensorFlowModule | null> => {
  try {
    return await getTensorFlowModule();
  } catch {
    return null;
  }
};

export const loadCategoryModel = async (): Promise<CategoryModelOperationResult> => {
  try {
    return await loadSavedModel();
  } catch {
    updateStatus({
      state: "error",
      isReady: false,
      source: "none",
      message: "Model loading failed.",
    });
    return createResult(false, "model_load_failed");
  }
};

export const trainCategoryModel = async (
  trainingExamples: readonly CategoryTrainingExample[] = mockTrainingData,
  options: TrainCategoryModelOptions = {},
): Promise<CategoryModelOperationResult> => {
  if (activeTrainingTask) {
    try {
      return await activeTrainingTask;
    } catch {
      return createResult(false, "training_failed");
    }
  }

  const trainingTask = trainModel(trainingExamples, options);
  activeTrainingTask = trainingTask;

  try {
    return await trainingTask;
  } catch {
    updateStatus({
      state: "error",
      isReady: false,
      source: "none",
      message: "Model training failed.",
    });
    return createResult(false, "training_failed");
  } finally {
    if (activeTrainingTask === trainingTask) {
      activeTrainingTask = null;
    }
  }
};

export const retrainCategoryModel = async (
  userTrainingExamples: readonly CategoryTrainingExample[],
): Promise<CategoryModelOperationResult> => {
  try {
    return await trainCategoryModel([...mockTrainingData, ...userTrainingExamples]);
  } catch {
    return createResult(false, "retraining_failed");
  }
};

export const retrainCategoryModelInBackground = (
  userTrainingExamples: readonly CategoryTrainingExample[],
): Promise<CategoryModelOperationResult> =>
  new Promise((resolve) => {
    try {
      runDuringIdleTime(() => {
        void retrainCategoryModel(userTrainingExamples).then(resolve);
      });
    } catch {
      resolve(createResult(false, "background_training_failed"));
    }
  });

export const initCategoryModel = async (
  options: InitCategoryModelOptions = {},
): Promise<CategoryModelOperationResult> => {
  try {
    const loadedModel = await loadCategoryModel();

    if (loadedModel.ok) {
      return loadedModel;
    }

    const trainingExamples = [
      ...mockTrainingData,
      ...(options.trainingExamples ?? []),
    ];

    if (options.background) {
      void retrainCategoryModelInBackground(options.trainingExamples ?? []);
      return createResult(false, "training_scheduled");
    }

    return await trainCategoryModel(trainingExamples);
  } catch {
    updateStatus({
      state: "error",
      isReady: false,
      source: "none",
      message: "Model initialization failed.",
    });
    return createResult(false, "initialization_failed");
  }
};

export const getLoadedCategoryModel = (): LayersModel | null => categoryModel;

export const disposeCategoryModel = (): CategoryModelOperationResult => {
  try {
    categoryModel?.dispose();
    categoryModel = null;
    updateStatus({ state: "idle", isReady: false, source: "none" });
    return createResult(true);
  } catch {
    return createResult(false, "dispose_failed");
  }
};
