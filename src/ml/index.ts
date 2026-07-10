export {
  disposeCategoryModel,
  encodeProductName,
  getCategoryModelStatus,
  initCategoryModel,
  loadCategoryModel,
  normalizeProductName,
  retrainCategoryModel,
  retrainCategoryModelInBackground,
  saveCategoryModel,
  trainCategoryModel,
} from "./categoryModel";
export { mockTrainingData } from "./mockTrainingData";
export { predictCategory, type PredictCategoryOptions } from "./predictCategory";
export {
  PRODUCT_CATEGORY_IDS,
  type CategoryModelOperationResult,
  type CategoryModelState,
  type CategoryModelStatus,
  type CategoryPrediction,
  type CategoryTrainingExample,
  type InitCategoryModelOptions,
  type ProductCategoryId,
  type TrainCategoryModelOptions,
} from "./types";
