import { create } from "zustand";

import {
  OTHER_CATEGORY_ID,
  createDefaultSettings,
  defaultCategories,
  getCatalogProduct,
  productDictionary,
} from "../data/catalog";
import {
  SETTINGS_RECORD_ID,
  ensureDatabaseDefaults,
  readShoppingDatabaseSnapshot,
  replaceShoppingDatabase,
  resetShoppingDatabase,
  shoppingDatabase,
} from "../db/database";
import type {
  CurrencyCode,
  ItemNecessity,
  PantryItem,
  PantryItemInput,
  PriceObservation,
  PriceObservationInput,
  ProductMemory,
  PurchaseEvent,
  ShoppingBackup,
  ShoppingCategory,
  ShoppingItem,
  ShoppingItemInput,
  ShoppingItemUpdate,
  ShoppingListMeta,
  ShoppingSettings,
  ShoppingTemplate,
  ShoppingTemplateInput,
  ShoppingUnit,
  TemplateItem,
} from "../domain/types";
import { recipeDietLabels, recipeHealthLabels } from "../domain/types";
import { capitalizeProductName, createUuid } from "../lib/format";
import {
  normalizeShoppingUnit,
  normalizeProductName,
  parseShoppingInput,
} from "../lib/parseShoppingInput";

type SettingsUpdate = Partial<Omit<ShoppingSettings, "id" | "updatedAt">>;
type CategoryUpdate = Partial<Pick<ShoppingCategory, "name" | "sortOrder">>;
type ItemDraft = ShoppingItemInput & { normalizedName?: string };
type CreateItemsOptions = {
  mergeExisting?: boolean;
  shoppingListId?: string;
};
type ImportedShoppingItem = Omit<ShoppingItem, "shoppingListId" | "necessity"> & {
  shoppingListId?: string;
  necessity?: ItemNecessity;
};
type ImportedPurchaseEvent = Omit<PurchaseEvent, "shoppingListId"> & {
  shoppingListId?: string;
};
type ImportedPriceObservation = Omit<PriceObservation, "countryCode"> & {
  countryCode?: string;
};
type ImportedShoppingSettings = Omit<
  ShoppingSettings,
  "recipeDiet" | "recipeHealthLabels"
> & {
  recipeDiet?: ShoppingSettings["recipeDiet"];
  recipeHealthLabels?: ShoppingSettings["recipeHealthLabels"];
};

export interface ClearBoughtResult {
  clearedCount: number;
  pantryAddedCount: number;
}

export interface PantryItemsResult {
  addedItems: PantryItem[];
  existingCount: number;
}

export interface RecipeItemsResult {
  addedItems: ShoppingItem[];
  skippedCount: number;
}

export interface ShoppingStoreState {
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  items: ShoppingItem[];
  categories: ShoppingCategory[];
  templates: ShoppingTemplate[];
  settings: ShoppingSettings;
  purchaseEvents: PurchaseEvent[];
  history: PurchaseEvent[];
  productMemory: ProductMemory[];
  shoppingListMeta: ShoppingListMeta[];
  priceObservations: PriceObservation[];
  pantryItems: PantryItem[];
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  addFromText: (input: string) => Promise<ShoppingItem[]>;
  addItem: (input: ShoppingItemInput) => Promise<ShoppingItem | null>;
  toggleItem: (itemId: string) => Promise<ShoppingItem | null>;
  deleteItem: (itemId: string) => Promise<void>;
  deleteItems: (itemIds: string[]) => Promise<ShoppingItem[]>;
  restoreItem: (item: ShoppingItem) => Promise<void>;
  restoreItems: (items: ShoppingItem[]) => Promise<void>;
  updateItem: (itemId: string, changes: ShoppingItemUpdate) => Promise<ShoppingItem | null>;
  updateItemQuantities: (quantities: Record<string, number>) => Promise<ShoppingItem[]>;
  setItemNecessity: (
    itemId: string,
    necessity: ItemNecessity,
  ) => Promise<ShoppingItem | null>;
  setItemCategory: (itemId: string, categoryId: string) => Promise<ShoppingItem | null>;
  setShoppingListBudget: (
    shoppingListId: string,
    budgetAmountMinor: number | undefined,
    currency?: CurrencyCode,
  ) => Promise<ShoppingListMeta>;
  savePriceObservation: (input: PriceObservationInput) => Promise<PriceObservation | null>;
  addPantryItems: (input: string) => Promise<PantryItemsResult>;
  deletePantryItem: (itemId: string) => Promise<PantryItem | null>;
  restorePantryItem: (item: PantryItem) => Promise<void>;
  addRecipeIngredients: (
    items: ShoppingItemInput[],
    shoppingListId?: string,
  ) => Promise<RecipeItemsResult>;
  clearBought: (shoppingListId: string) => Promise<ClearBoughtResult>;
  clearItems: () => Promise<void>;
  applyTemplate: (template: ShoppingTemplate | string) => Promise<ShoppingItem[]>;
  createTemplate: (input: ShoppingTemplateInput) => Promise<ShoppingTemplate | null>;
  updateTemplate: (
    templateId: string,
    input: Partial<ShoppingTemplateInput>,
  ) => Promise<ShoppingTemplate | null>;
  deleteTemplate: (templateId: string) => Promise<void>;
  createCategory: (name: string) => Promise<ShoppingCategory | null>;
  updateCategory: (
    categoryId: string,
    changes: CategoryUpdate,
  ) => Promise<ShoppingCategory | null>;
  deleteCategory: (categoryId: string) => Promise<boolean>;
  updateSettings: (changes: SettingsUpdate) => Promise<ShoppingSettings>;
  exportData: () => Promise<ShoppingBackup>;
  importData: (data: unknown) => Promise<void>;
  resetData: () => Promise<void>;
}

let initializationPromise: Promise<void> | null = null;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unable to save changes.";

const normalizeQuantity = (value: number | undefined): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return value;
};

const normalizePrice = (value: number | undefined): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }

  return value;
};

const isCurrencyCode = (value: unknown): value is CurrencyCode =>
  value === "UAH" || value === "USD" || value === "EUR" || value === "PLN";

const isItemNecessity = (value: unknown): value is ItemNecessity =>
  value === "required" || value === "optional";

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isPositiveFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const getUnitBasis = (
  unit: ShoppingUnit,
): { dimension: "count" | "weight" | "volume" | "pack"; multiplier: number } => {
  if (unit === "kg") {
    return { dimension: "weight", multiplier: 1_000 };
  }

  if (unit === "g") {
    return { dimension: "weight", multiplier: 1 };
  }

  if (unit === "l") {
    return { dimension: "volume", multiplier: 1_000 };
  }

  if (unit === "ml") {
    return { dimension: "volume", multiplier: 1 };
  }

  if (unit === "pack") {
    return { dimension: "pack", multiplier: 1 };
  }

  return { dimension: "count", multiplier: 1 };
};

const getActualLineAmountMinor = (
  purchaseEvent: PurchaseEvent,
  observation: PriceObservation,
): number => {
  const itemBasis = getUnitBasis(purchaseEvent.unit);
  const packageBasis = getUnitBasis(observation.packageUnit);

  if (itemBasis.dimension !== packageBasis.dimension) {
    throw new Error("The package unit is not compatible with this item.");
  }

  const quantityRatio =
    (purchaseEvent.quantity * itemBasis.multiplier) /
    (observation.packageQuantity * packageBasis.multiplier);
  const actualAmountMinor = Math.round(observation.amountMinor * quantityRatio);

  if (!Number.isSafeInteger(actualAmountMinor) || actualAmountMinor < 0) {
    throw new Error("The calculated purchase amount is invalid.");
  }

  return actualAmountMinor;
};

const getFallbackCategoryId = (categories: ShoppingCategory[]): string => {
  if (categories.some((category) => category.id === OTHER_CATEGORY_ID)) {
    return OTHER_CATEGORY_ID;
  }

  return categories[0]?.id ?? OTHER_CATEGORY_ID;
};

const getAvailableCategoryId = async (
  normalizedName: string,
  categories: ShoppingCategory[],
  requestedCategoryId?: string,
): Promise<string> => {
  const availableCategoryIds = new Set(categories.map((category) => category.id));
  const fallbackCategoryId = getFallbackCategoryId(categories);

  if (requestedCategoryId && availableCategoryIds.has(requestedCategoryId)) {
    return requestedCategoryId;
  }

  const rememberedProduct = await shoppingDatabase.productMemory
    .where("normalizedName")
    .equals(normalizedName)
    .first();

  if (rememberedProduct && availableCategoryIds.has(rememberedProduct.categoryId)) {
    return rememberedProduct.categoryId;
  }

  const catalogProduct = getCatalogProduct(normalizedName);
  if (catalogProduct && availableCategoryIds.has(catalogProduct.categoryId)) {
    return catalogProduct.categoryId;
  }

  return fallbackCategoryId;
};

const getDisplayName = (name: string): string => capitalizeProductName(name);

export const getCanonicalProductName = (name: string): string => {
  const normalizedName = normalizeProductName(name);
  const catalogProduct = productDictionary[normalizedName];
  return normalizeProductName(catalogProduct?.name ?? normalizedName);
};

const normalizePantryInput = (input: PantryItemInput): PantryItemInput | null => {
  const name = input.name.trim();

  if (!name) {
    return null;
  }

  return {
    name: getDisplayName(name),
    categoryId: input.categoryId,
  };
};

const parsePantryInput = (
  input: string,
  knownProductNames: ReadonlySet<string>,
): PantryItemInput[] =>
  parseShoppingInput(input, knownProductNames).map((item) => ({ name: item.name }));

const createItemsFromDrafts = async (
  drafts: ItemDraft[],
  options: CreateItemsOptions = {},
): Promise<ShoppingItem[]> => {
  const savedItems: ShoppingItem[] = [];

  await shoppingDatabase.transaction(
    "rw",
    [
      shoppingDatabase.categories,
      shoppingDatabase.items,
      shoppingDatabase.productMemory,
      shoppingDatabase.shoppingListMeta,
      shoppingDatabase.settings,
    ],
    async () => {
      const [categories, currentItems, settings] = await Promise.all([
        shoppingDatabase.categories.toArray(),
        shoppingDatabase.items.toArray(),
        shoppingDatabase.settings.get(SETTINGS_RECORD_ID),
      ]);
      const currentListItem = [...currentItems]
        .filter(
          (item) =>
            options.shoppingListId === undefined ||
            item.shoppingListId === options.shoppingListId,
        )
        .sort((firstItem, secondItem) => {
          if (firstItem.isBought !== secondItem.isBought) {
            return Number(firstItem.isBought) - Number(secondItem.isBought);
          }

          return secondItem.updatedAt - firstItem.updatedAt;
        })[0];
      const shoppingListId =
        options.shoppingListId ?? currentListItem?.shoppingListId ?? createUuid();

      for (const draft of drafts) {
        const normalizedName = draft.normalizedName ?? normalizeProductName(draft.name);
        if (!normalizedName) {
          continue;
        }

        const unit = normalizeShoppingUnit(draft.unit) ?? "pcs";
        const categoryId = await getAvailableCategoryId(
          normalizedName,
          categories,
          draft.categoryId,
        );
        const matchingItems = await shoppingDatabase.items
          .where("normalizedName")
          .equals(normalizedName)
          .toArray();
        const existingItem = matchingItems.find(
          (item) =>
            !item.isBought &&
            item.unit === unit &&
            item.shoppingListId === shoppingListId,
        );
        const currentTimestamp = Date.now();

        if (existingItem) {
          if (options.mergeExisting === false) {
            continue;
          }

          const updatedItem: ShoppingItem = {
            ...existingItem,
            quantity: existingItem.quantity + normalizeQuantity(draft.quantity),
            categoryId: draft.categoryId ? categoryId : existingItem.categoryId,
            necessity: draft.necessity ?? existingItem.necessity,
            price: normalizePrice(draft.price) ?? existingItem.price,
            updatedAt: currentTimestamp,
          };

          await shoppingDatabase.items.put(updatedItem);
          savedItems.push(updatedItem);
          continue;
        }

        const newItem: ShoppingItem = {
          id: createUuid(),
          shoppingListId,
          name: getDisplayName(draft.name),
          normalizedName,
          quantity: normalizeQuantity(draft.quantity),
          unit,
          categoryId,
          necessity: draft.necessity ?? "required",
          price: normalizePrice(draft.price),
          isBought: false,
          createdAt: currentTimestamp,
          updatedAt: currentTimestamp,
        };

        await shoppingDatabase.items.add(newItem);
        savedItems.push(newItem);
      }

      if (savedItems.length > 0) {
        const currentTimestamp = Date.now();
        const existingMeta = await shoppingDatabase.shoppingListMeta.get(shoppingListId);
        const listItems = currentItems.filter((item) => item.shoppingListId === shoppingListId);
        const createdAt = listItems.reduce(
          (earliestTimestamp, item) => Math.min(earliestTimestamp, item.createdAt),
          currentTimestamp,
        );

        await shoppingDatabase.shoppingListMeta.put({
          shoppingListId,
          budgetAmountMinor: existingMeta?.budgetAmountMinor,
          currency: existingMeta?.currency ?? settings?.currency ?? "UAH",
          countryCode: existingMeta?.countryCode ?? "UA",
          createdAt: existingMeta?.createdAt ?? createdAt,
          updatedAt: currentTimestamp,
        });
      }
    },
  );

  return savedItems;
};

const restoreShoppingItems = async (items: ShoppingItem[]): Promise<void> => {
  if (items.length === 0) {
    return;
  }

  await shoppingDatabase.transaction(
    "rw",
    [
      shoppingDatabase.items,
      shoppingDatabase.shoppingListMeta,
      shoppingDatabase.settings,
    ],
    async () => {
      const [currentItems, settings] = await Promise.all([
        shoppingDatabase.items.toArray(),
        shoppingDatabase.settings.get(SETTINGS_RECORD_ID),
      ]);
      const latestCurrentItem = [...currentItems].sort(
        (firstItem, secondItem) => secondItem.updatedAt - firstItem.updatedAt,
      )[0];
      let activeShoppingListId =
        currentItems.find((item) => !item.isBought)?.shoppingListId ??
        latestCurrentItem?.shoppingListId;
      const currentTimestamp = Date.now();

      for (const item of items) {
        if (!activeShoppingListId) {
          activeShoppingListId = item.shoppingListId;
        }

        const shoppingListId = activeShoppingListId ?? item.shoppingListId;
        const restoredItem: ShoppingItem = {
          ...item,
          shoppingListId,
          necessity: item.necessity ?? "required",
          updatedAt: currentTimestamp,
        };

        await shoppingDatabase.items.put(restoredItem);

        const existingMeta = await shoppingDatabase.shoppingListMeta.get(shoppingListId);

        await shoppingDatabase.shoppingListMeta.put({
          shoppingListId,
          budgetAmountMinor: existingMeta?.budgetAmountMinor,
          currency: existingMeta?.currency ?? settings?.currency ?? "UAH",
          countryCode: existingMeta?.countryCode ?? "UA",
          createdAt: existingMeta?.createdAt ?? restoredItem.createdAt,
          updatedAt: currentTimestamp,
        });
      }
    },
  );
};

const getAverageIntervalDays = (events: PurchaseEvent[]): number | undefined => {
  if (events.length < 2) {
    return undefined;
  }

  const orderedEvents = [...events].sort(
    (firstEvent, secondEvent) => firstEvent.boughtAt - secondEvent.boughtAt,
  );
  const intervalSum = orderedEvents.slice(1).reduce((sum, event, index) => {
    return sum + (event.boughtAt - orderedEvents[index].boughtAt);
  }, 0);

  return intervalSum / (orderedEvents.length - 1) / 86_400_000;
};

const rebuildProductMemory = async (normalizedName: string): Promise<void> => {
  const [events, existingMemory] = await Promise.all([
    shoppingDatabase.purchaseEvents.where("normalizedName").equals(normalizedName).toArray(),
    shoppingDatabase.productMemory.where("normalizedName").equals(normalizedName).first(),
  ]);

  if (events.length === 0) {
    if (existingMemory) {
      await shoppingDatabase.productMemory.put({
        ...existingMemory,
        buyCount: 0,
        lastBoughtAt: undefined,
        averageIntervalDays: undefined,
        averagePrice: undefined,
      });
    }

    return;
  }

  const latestEvent = [...events].sort(
    (firstEvent, secondEvent) => secondEvent.boughtAt - firstEvent.boughtAt,
  )[0];
  const quantities = events.map((event) => event.quantity);
  const pricedEvents = events.filter((event) => typeof event.price === "number");
  const averagePrice =
    pricedEvents.length > 0
      ? pricedEvents.reduce((sum, event) => sum + (event.price ?? 0), 0) / pricedEvents.length
      : undefined;

  await shoppingDatabase.productMemory.put({
    id: existingMemory?.id ?? createUuid(),
    name: latestEvent.itemName,
    normalizedName,
    categoryId: latestEvent.categoryId,
    defaultQuantity: quantities.reduce((sum, quantity) => sum + quantity, 0) / quantities.length,
    defaultUnit: latestEvent.unit,
    buyCount: events.length,
    lastBoughtAt: latestEvent.boughtAt,
    averageIntervalDays: getAverageIntervalDays(events),
    averagePrice,
    relatedItems: existingMemory?.relatedItems ?? {},
  });
};

const saveManualCategoryMemory = async (item: ShoppingItem): Promise<void> => {
  const existingMemory = await shoppingDatabase.productMemory
    .where("normalizedName")
    .equals(item.normalizedName)
    .first();

  await shoppingDatabase.productMemory.put({
    id: existingMemory?.id ?? createUuid(),
    name: item.name,
    normalizedName: item.normalizedName,
    categoryId: item.categoryId,
    defaultQuantity: existingMemory?.defaultQuantity ?? item.quantity,
    defaultUnit: existingMemory?.defaultUnit ?? item.unit,
    buyCount: existingMemory?.buyCount ?? 0,
    lastBoughtAt: existingMemory?.lastBoughtAt,
    averageIntervalDays: existingMemory?.averageIntervalDays,
    averagePrice: existingMemory?.averagePrice,
    relatedItems: existingMemory?.relatedItems ?? {},
  });
};

const normalizeTemplateItems = (items: TemplateItem[]): TemplateItem[] =>
  items
    .map((item) => {
      const normalizedName = normalizeProductName(item.name);

      if (!normalizedName) {
        return null;
      }

      return {
        name: capitalizeProductName(item.name),
        normalizedName,
        quantity: normalizeQuantity(item.quantity),
        unit: normalizeShoppingUnit(item.unit) ?? "pcs",
        categoryId: item.categoryId || OTHER_CATEGORY_ID,
      };
    })
    .filter((item): item is TemplateItem => item !== null);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 500;

const hasUniqueValues = <Value,>(
  values: readonly Value[],
  getKey: (value: Value) => string,
): boolean => new Set(values.map(getKey)).size === values.length;

const isShoppingCategory = (value: unknown): value is ShoppingCategory =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  isFiniteNumber(value.sortOrder) &&
  typeof value.isDefault === "boolean";

const isPantryItem = (value: unknown): value is PantryItem =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  isNonEmptyString(value.normalizedName) &&
  isNonEmptyString(value.canonicalName) &&
  isNonEmptyString(value.categoryId) &&
  isNonNegativeInteger(value.createdAt) &&
  isNonNegativeInteger(value.updatedAt) &&
  (value.lastPurchasedAt === undefined || isNonNegativeInteger(value.lastPurchasedAt));

const isShoppingItem = (value: unknown): value is ImportedShoppingItem =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  (value.shoppingListId === undefined || isNonEmptyString(value.shoppingListId)) &&
  isNonEmptyString(value.name) &&
  isNonEmptyString(value.normalizedName) &&
  isPositiveFiniteNumber(value.quantity) &&
  normalizeShoppingUnit(value.unit) !== null &&
  isNonEmptyString(value.categoryId) &&
  (value.necessity === undefined || isItemNecessity(value.necessity)) &&
  typeof value.isBought === "boolean" &&
  isNonNegativeInteger(value.createdAt) &&
  isNonNegativeInteger(value.updatedAt) &&
  (value.price === undefined || (isFiniteNumber(value.price) && value.price >= 0)) &&
  (value.boughtAt === undefined || isNonNegativeInteger(value.boughtAt));

const isTemplateItem = (value: unknown): value is TemplateItem =>
  isRecord(value) &&
  isNonEmptyString(value.name) &&
  isNonEmptyString(value.normalizedName) &&
  isPositiveFiniteNumber(value.quantity) &&
  normalizeShoppingUnit(value.unit) !== null &&
  isNonEmptyString(value.categoryId);

const isShoppingTemplate = (value: unknown): value is ShoppingTemplate =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  Array.isArray(value.items) &&
  value.items.every(isTemplateItem) &&
  isNonNegativeInteger(value.createdAt) &&
  isNonNegativeInteger(value.updatedAt) &&
  (value.isStarter === undefined || typeof value.isStarter === "boolean");

const isRecipeDietLabel = (value: unknown): value is ShoppingSettings["recipeDiet"] =>
  value === null || recipeDietLabels.some((label) => label === value);

const isRecipeHealthLabel = (
  value: unknown,
): value is ShoppingSettings["recipeHealthLabels"][number] =>
  recipeHealthLabels.some((label) => label === value);

const isShoppingSettings = (value: unknown): value is ImportedShoppingSettings =>
  isRecord(value) &&
  value.id === SETTINGS_RECORD_ID &&
  (value.theme === "system" || value.theme === "light" || value.theme === "dark") &&
  (value.language === "ru" || value.language === "uk" || value.language === "en") &&
  typeof value.hideBoughtItems === "boolean" &&
  typeof value.groupByCategory === "boolean" &&
  typeof value.enableAiSuggestions === "boolean" &&
  typeof value.enableLocalMlTraining === "boolean" &&
  (value.recipeDiet === undefined || isRecipeDietLabel(value.recipeDiet)) &&
  (value.recipeHealthLabels === undefined ||
    (Array.isArray(value.recipeHealthLabels) &&
      value.recipeHealthLabels.every(isRecipeHealthLabel))) &&
  (value.currency === "UAH" ||
    value.currency === "USD" ||
    value.currency === "EUR" ||
    value.currency === "PLN") &&
  isNonNegativeInteger(value.updatedAt);

const isPurchaseEvent = (value: unknown): value is ImportedPurchaseEvent =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  (value.shoppingListId === undefined || isNonEmptyString(value.shoppingListId)) &&
  isNonEmptyString(value.itemId) &&
  isNonEmptyString(value.itemName) &&
  isNonEmptyString(value.normalizedName) &&
  isNonEmptyString(value.categoryId) &&
  isPositiveFiniteNumber(value.quantity) &&
  normalizeShoppingUnit(value.unit) !== null &&
  (value.price === undefined || (isFiniteNumber(value.price) && value.price >= 0)) &&
  (value.priceObservationId === undefined || isNonEmptyString(value.priceObservationId)) &&
  (value.actualAmountMinor === undefined || isNonNegativeInteger(value.actualAmountMinor)) &&
  (value.actualCurrency === undefined || isCurrencyCode(value.actualCurrency)) &&
  isNonNegativeInteger(value.boughtAt);

const isShoppingListMeta = (value: unknown): value is ShoppingListMeta =>
  isRecord(value) &&
  isNonEmptyString(value.shoppingListId) &&
  (value.budgetAmountMinor === undefined || isNonNegativeInteger(value.budgetAmountMinor)) &&
  isCurrencyCode(value.currency) &&
  isNonEmptyString(value.countryCode) &&
  isNonNegativeInteger(value.createdAt) &&
  isNonNegativeInteger(value.updatedAt);

const isPriceObservation = (value: unknown): value is ImportedPriceObservation =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.shoppingListId) &&
  (value.countryCode === undefined ||
    (typeof value.countryCode === "string" && value.countryCode.trim().length > 0)) &&
  isNonEmptyString(value.itemId) &&
  (value.purchaseEventId === undefined || isNonEmptyString(value.purchaseEventId)) &&
  isNonEmptyString(value.itemName) &&
  isNonEmptyString(value.normalizedName) &&
  isNonNegativeInteger(value.amountMinor) &&
  isCurrencyCode(value.currency) &&
  isPositiveFiniteNumber(value.packageQuantity) &&
  normalizeShoppingUnit(value.packageUnit) !== null &&
  (value.source === "manual" || value.source === "provider") &&
  isNonNegativeInteger(value.observedAt);

const isProductMemory = (value: unknown): value is ProductMemory =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  isNonEmptyString(value.normalizedName) &&
  isNonEmptyString(value.categoryId) &&
  isPositiveFiniteNumber(value.defaultQuantity) &&
  normalizeShoppingUnit(value.defaultUnit) !== null &&
  isNonNegativeInteger(value.buyCount) &&
  isRecord(value.relatedItems) &&
  Object.values(value.relatedItems).every(isNonNegativeInteger) &&
  (value.lastBoughtAt === undefined || isNonNegativeInteger(value.lastBoughtAt)) &&
  (value.averageIntervalDays === undefined ||
    (isFiniteNumber(value.averageIntervalDays) && value.averageIntervalDays >= 0)) &&
  (value.averagePrice === undefined ||
    (isFiniteNumber(value.averagePrice) && value.averagePrice >= 0));

const getCanonicalUnit = (value: unknown) => normalizeShoppingUnit(value) ?? "pcs";

const hasShoppingListId = (
  value: ImportedShoppingItem | ImportedPurchaseEvent,
): value is (ImportedShoppingItem | ImportedPurchaseEvent) & { shoppingListId: string } =>
  typeof value.shoppingListId === "string" && value.shoppingListId.trim().length > 0;

const hasItemNecessity = (
  value: ImportedShoppingItem,
): value is ImportedShoppingItem & { necessity: ItemNecessity } =>
  isItemNecessity(value.necessity);

const getLocalDateKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const parseShoppingBackup = (value: unknown): ShoppingBackup => {
  if (
    !isRecord(value) ||
    (value.version !== 1 &&
      value.version !== 2 &&
      value.version !== 3 &&
      value.version !== 4) ||
    !isNonNegativeInteger(value.exportedAt) ||
    !Array.isArray(value.categories) ||
    !Array.isArray(value.items) ||
    !Array.isArray(value.productMemory) ||
    !Array.isArray(value.templates) ||
    !Array.isArray(value.settings) ||
    !Array.isArray(value.purchaseEvents)
  ) {
    throw new Error("The import file has an invalid format.");
  }

  if (
    value.version >= 3 &&
    (!Array.isArray(value.shoppingListMeta) || !Array.isArray(value.priceObservations))
  ) {
    throw new Error("The import file has an invalid format.");
  }

  if (value.version === 4 && !Array.isArray(value.pantryItems)) {
    throw new Error("The import file has an invalid format.");
  }

  if (
    !value.categories.every(isShoppingCategory) ||
    !value.items.every(isShoppingItem) ||
    !value.productMemory.every(isProductMemory) ||
    !value.templates.every(isShoppingTemplate) ||
    !value.settings.every(isShoppingSettings) ||
    !value.purchaseEvents.every(isPurchaseEvent)
  ) {
    throw new Error("The import file contains unsupported data.");
  }

  const backupCollections = [
    value.categories,
    value.items,
    value.productMemory,
    value.templates,
    value.settings,
    value.purchaseEvents,
    Array.isArray(value.shoppingListMeta) ? value.shoppingListMeta : [],
    Array.isArray(value.priceObservations) ? value.priceObservations : [],
    Array.isArray(value.pantryItems) ? value.pantryItems : [],
  ];
  const recordCount = backupCollections.reduce(
    (totalCount, collection) => totalCount + collection.length,
    0,
  );

  if (recordCount > 100_000 || value.settings.length > 1) {
    throw new Error("The import file contains too many records.");
  }

  const importedCategories = value.categories as ShoppingCategory[];
  const importedProductMemory = value.productMemory as ProductMemory[];
  const importedTemplates = value.templates as ShoppingTemplate[];

  if (
    !hasUniqueValues(importedCategories, (category) => category.id) ||
    !hasUniqueValues(value.items as ImportedShoppingItem[], (item) => item.id) ||
    !hasUniqueValues(importedProductMemory, (memory) => memory.id) ||
    !hasUniqueValues(importedProductMemory, (memory) => memory.normalizedName) ||
    !hasUniqueValues(importedTemplates, (template) => template.id) ||
    !hasUniqueValues(value.purchaseEvents as ImportedPurchaseEvent[], (event) => event.id) ||
    importedProductMemory.some(
      (memory) => Object.keys(memory.relatedItems).length > 1_000,
    )
  ) {
    throw new Error("The import file contains duplicate or unsupported records.");
  }

  const availableCategoryIds = new Set([
    ...defaultCategories.map((category) => category.id),
    ...importedCategories.map((category) => category.id),
  ]);
  const hasUnavailableCategory = [
    ...(value.items as ImportedShoppingItem[]).map((item) => item.categoryId),
    ...importedProductMemory.map((memory) => memory.categoryId),
    ...(value.purchaseEvents as ImportedPurchaseEvent[]).map((event) => event.categoryId),
    ...importedTemplates.flatMap((template) =>
      template.items.map((item) => item.categoryId),
    ),
    ...(Array.isArray(value.pantryItems)
      ? value.pantryItems.flatMap((item) =>
          isRecord(item) && typeof item.categoryId === "string"
            ? [item.categoryId]
            : [],
        )
      : []),
  ].some((categoryId) => !availableCategoryIds.has(categoryId));

  if (hasUnavailableCategory) {
    throw new Error("The import file references a category that does not exist.");
  }

  const backupVersion = value.version;
  const importedItems = value.items as ImportedShoppingItem[];
  const importedPurchaseEvents = value.purchaseEvents as ImportedPurchaseEvent[];
  const importedShoppingListMeta =
    backupVersion >= 3 ? (value.shoppingListMeta as unknown[]) : [];
  const importedPriceObservations =
    backupVersion >= 3 ? (value.priceObservations as unknown[]) : [];
  const importedPantryItems =
    backupVersion === 4 ? (value.pantryItems as unknown[]) : [];

  if (
    backupVersion >= 2 &&
    (!importedItems.every(hasShoppingListId) || !importedPurchaseEvents.every(hasShoppingListId))
  ) {
    throw new Error("The import file contains unsupported data.");
  }

  if (
    backupVersion >= 3 &&
    (!importedItems.every(hasItemNecessity) ||
      !importedShoppingListMeta.every(isShoppingListMeta) ||
      !importedPriceObservations.every(isPriceObservation))
  ) {
    throw new Error("The import file contains unsupported data.");
  }

  if (backupVersion === 4 && !importedPantryItems.every(isPantryItem)) {
    throw new Error("The import file contains unsupported data.");
  }

  if (
    (backupVersion >= 3 &&
      (!hasUniqueValues(
        importedShoppingListMeta as ShoppingListMeta[],
        (meta) => meta.shoppingListId,
      ) ||
        !hasUniqueValues(
          importedPriceObservations as ImportedPriceObservation[],
          (observation) => observation.id,
        ))) ||
    (backupVersion === 4 &&
      !hasUniqueValues(importedPantryItems as PantryItem[], (item) => item.id))
  ) {
    throw new Error("The import file contains duplicate records.");
  }

  const legacyShoppingListId = createUuid();
  const orderedImportedItems = [...importedItems].sort(
    (firstItem, secondItem) => secondItem.updatedAt - firstItem.updatedAt,
  );
  const latestImportedItem = orderedImportedItems[0];
  const currentShoppingListId =
    (backupVersion >= 2
      ? orderedImportedItems.find((item) => !item.isBought && hasShoppingListId(item))
          ?.shoppingListId ??
        (latestImportedItem && hasShoppingListId(latestImportedItem)
          ? latestImportedItem.shoppingListId
          : undefined)
      : undefined) ?? legacyShoppingListId;
  const currentItemIds = new Set(importedItems.map((item) => item.id));
  const legacyShoppingListIdsByDate = new Map<string, string>();
  const getLegacyShoppingListId = (purchaseEvent: ImportedPurchaseEvent): string => {
    if (currentItemIds.has(purchaseEvent.itemId)) {
      return currentShoppingListId;
    }

    const localDateKey = getLocalDateKey(purchaseEvent.boughtAt);
    const shoppingListId = legacyShoppingListIdsByDate.get(localDateKey) ?? createUuid();
    legacyShoppingListIdsByDate.set(localDateKey, shoppingListId);

    return shoppingListId;
  };

  const items: ShoppingItem[] = importedItems.map((item) => ({
      ...item,
      shoppingListId: currentShoppingListId,
      necessity: hasItemNecessity(item) ? item.necessity : "required",
      unit: getCanonicalUnit(item.unit),
    }));
  const purchaseEvents: PurchaseEvent[] = importedPurchaseEvents.map((event) => ({
    ...event,
    shoppingListId:
      backupVersion >= 2 && hasShoppingListId(event)
        ? event.shoppingListId
        : getLegacyShoppingListId(event),
    unit: getCanonicalUnit(event.unit),
  }));
  const providedShoppingListMeta = importedShoppingListMeta as ShoppingListMeta[];
  const shoppingListMetaById = new Map(
    providedShoppingListMeta.map((meta) => [meta.shoppingListId, meta]),
  );
  const priceObservations: PriceObservation[] = importedPriceObservations.map((observation) => {
    const priceObservation = observation as ImportedPriceObservation;

    return {
      ...priceObservation,
      countryCode:
        priceObservation.countryCode ??
        shoppingListMetaById.get(priceObservation.shoppingListId)?.countryCode ??
        "UA",
      packageUnit: getCanonicalUnit(priceObservation.packageUnit),
    };
  });
  const listActivityById = new Map<string, { createdAt: number; updatedAt: number }>();
  const includeListActivity = (
    shoppingListId: string,
    createdAt: number,
    updatedAt: number,
  ): void => {
    const currentActivity = listActivityById.get(shoppingListId);

    listActivityById.set(shoppingListId, {
      createdAt: Math.min(currentActivity?.createdAt ?? createdAt, createdAt),
      updatedAt: Math.max(currentActivity?.updatedAt ?? updatedAt, updatedAt),
    });
  };

  for (const item of items) {
    includeListActivity(item.shoppingListId, item.createdAt, item.updatedAt);
  }

  for (const purchaseEvent of purchaseEvents) {
    includeListActivity(
      purchaseEvent.shoppingListId,
      purchaseEvent.boughtAt,
      purchaseEvent.boughtAt,
    );
  }

  for (const observation of priceObservations) {
    includeListActivity(
      observation.shoppingListId,
      observation.observedAt,
      observation.observedAt,
    );
  }

  const defaultCurrency = value.settings[0]?.currency ?? "UAH";

  for (const [shoppingListId, activity] of listActivityById) {
    if (shoppingListMetaById.has(shoppingListId)) {
      continue;
    }

    shoppingListMetaById.set(shoppingListId, {
      shoppingListId,
      currency: defaultCurrency,
      countryCode: "UA",
      createdAt: activity.createdAt,
      updatedAt: activity.updatedAt,
    });
  }

  const purchaseEventsById = new Map(
    purchaseEvents.map((purchaseEvent) => [purchaseEvent.id, purchaseEvent]),
  );
  const manualObservationsByEventId = new Map<
    string,
    { observation: PriceObservation; actualAmountMinor: number }
  >();

  for (const observation of priceObservations) {
    const listMeta = shoppingListMetaById.get(observation.shoppingListId);

    if (
      !listMeta ||
      observation.currency !== listMeta.currency ||
      observation.countryCode !== listMeta.countryCode
    ) {
      throw new Error("The import file contains inconsistent price information.");
    }

    if (observation.source !== "manual") {
      continue;
    }

    const purchaseEvent = observation.purchaseEventId
      ? purchaseEventsById.get(observation.purchaseEventId)
      : undefined;

    if (
      !purchaseEvent ||
      purchaseEvent.itemId !== observation.itemId ||
      purchaseEvent.shoppingListId !== observation.shoppingListId ||
      (purchaseEvent.priceObservationId !== undefined &&
        purchaseEvent.priceObservationId !== observation.id) ||
      (purchaseEvent.actualCurrency !== undefined &&
        purchaseEvent.actualCurrency !== observation.currency) ||
      manualObservationsByEventId.has(purchaseEvent.id)
    ) {
      throw new Error("The import file contains inconsistent price information.");
    }

    manualObservationsByEventId.set(purchaseEvent.id, {
      observation,
      actualAmountMinor: getActualLineAmountMinor(purchaseEvent, observation),
    });
  }

  const normalizedPurchaseEvents = purchaseEvents.map((purchaseEvent) => {
    const linkedPrice = manualObservationsByEventId.get(purchaseEvent.id);

    if (!linkedPrice) {
      return purchaseEvent;
    }

    return {
      ...purchaseEvent,
      priceObservationId: linkedPrice.observation.id,
      actualAmountMinor: linkedPrice.actualAmountMinor,
      actualCurrency: linkedPrice.observation.currency,
    };
  });
  const pantryItemsByCanonicalName = new Map<string, PantryItem>();

  for (const importedPantryItem of importedPantryItems as PantryItem[]) {
    const canonicalName = getCanonicalProductName(importedPantryItem.name);

    if (!canonicalName) {
      continue;
    }

    const currentItem = pantryItemsByCanonicalName.get(canonicalName);
    if (!currentItem || importedPantryItem.updatedAt > currentItem.updatedAt) {
      pantryItemsByCanonicalName.set(canonicalName, {
        ...importedPantryItem,
        normalizedName: normalizeProductName(importedPantryItem.name),
        canonicalName,
      });
    }
  }

  return {
    version: 4,
    exportedAt: value.exportedAt,
    categories: value.categories,
    items,
    shoppingListMeta: [...shoppingListMetaById.values()],
    priceObservations,
    productMemory: value.productMemory.map((memory) => ({
      ...memory,
      defaultUnit: getCanonicalUnit(memory.defaultUnit),
    })),
    pantryItems: [...pantryItemsByCanonicalName.values()],
    templates: value.templates.map((template) => ({
      ...template,
      items: template.items.map((item) => ({
        ...item,
        unit: getCanonicalUnit(item.unit),
      })),
    })),
    settings: (value.settings as ImportedShoppingSettings[]).map((settings) => ({
      ...settings,
      recipeDiet: settings.recipeDiet ?? null,
      recipeHealthLabels: settings.recipeHealthLabels ?? [],
    })),
    purchaseEvents: normalizedPurchaseEvents,
  };
};

export const useShoppingStore = create<ShoppingStoreState>((set, get) => {
  let latestSyncRequest = 0;

  const sync = async (): Promise<void> => {
    const syncRequest = latestSyncRequest + 1;
    latestSyncRequest = syncRequest;
    const snapshot = await readShoppingDatabaseSnapshot();

    if (syncRequest !== latestSyncRequest) {
      return;
    }

    set({
      categories: snapshot.categories,
      items: snapshot.items,
      templates: snapshot.templates,
      settings: snapshot.settings,
      purchaseEvents: snapshot.purchaseEvents,
      history: snapshot.purchaseEvents,
      productMemory: snapshot.productMemory,
      shoppingListMeta: snapshot.shoppingListMeta,
      priceObservations: snapshot.priceObservations,
      pantryItems: snapshot.pantryItems,
    });
  };

  const ensureReady = async (): Promise<void> => {
    if (!get().isReady) {
      await get().initialize();
    }
  };

  const runWithError = async <Result,>(operation: () => Promise<Result>): Promise<Result> => {
    try {
      if (get().error !== null) {
        set({ error: null });
      }
      return await operation();
    } catch (error) {
      set({ error: getErrorMessage(error) });
      throw error;
    }
  };

  return {
    isReady: false,
    isLoading: false,
    error: null,
    items: [],
    categories: defaultCategories.map((category) => ({ ...category })),
    templates: [],
    settings: createDefaultSettings(0),
    purchaseEvents: [],
    history: [],
    productMemory: [],
    shoppingListMeta: [],
    priceObservations: [],
    pantryItems: [],

    initialize: async (): Promise<void> => {
      if (get().isReady) {
        return;
      }

      if (initializationPromise) {
        return initializationPromise;
      }

      const currentInitialization = (async (): Promise<void> => {
        set({ isLoading: true, error: null });

        try {
          await ensureDatabaseDefaults();
          await sync();
          set({ isReady: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false, error: getErrorMessage(error) });
          throw error;
        }
      })();

      initializationPromise = currentInitialization;

      try {
        await currentInitialization;
      } finally {
        initializationPromise = null;
      }
    },

    refresh: async (): Promise<void> =>
      runWithError(async () => {
        await ensureReady();
        await sync();
      }),

    addFromText: async (input: string): Promise<ShoppingItem[]> =>
      runWithError(async () => {
        await ensureReady();
        const currentState = get();
        const knownProductNames = new Set([
          ...Object.keys(productDictionary),
          ...currentState.productMemory.map((memory) => memory.normalizedName),
          ...currentState.items.map((item) => item.normalizedName),
        ]);
        const parsedItems = parseShoppingInput(input, knownProductNames);

        if (parsedItems.length === 0) {
          return [];
        }

        const savedItems = await createItemsFromDrafts(parsedItems);
        await sync();
        return savedItems;
      }),

    addItem: async (input: ShoppingItemInput): Promise<ShoppingItem | null> =>
      runWithError(async () => {
        await ensureReady();
        const savedItems = await createItemsFromDrafts([input]);
        await sync();
        return savedItems[0] ?? null;
      }),

    toggleItem: async (itemId: string): Promise<ShoppingItem | null> =>
      runWithError(async () => {
        await ensureReady();
        let updatedItem: ShoppingItem | null = null;

        await shoppingDatabase.transaction(
          "rw",
          [
            shoppingDatabase.items,
            shoppingDatabase.purchaseEvents,
            shoppingDatabase.productMemory,
            shoppingDatabase.priceObservations,
            shoppingDatabase.shoppingListMeta,
          ],
          async () => {
            const currentItem = await shoppingDatabase.items.get(itemId);
            if (!currentItem) {
              return;
            }

            const currentTimestamp = Date.now();
            const isBought = !currentItem.isBought;
            const activeListItem = isBought
              ? undefined
              : (await shoppingDatabase.items.toArray()).find(
                  (item) => item.id !== currentItem.id && !item.isBought,
                );
            const nextItem: ShoppingItem = {
              ...currentItem,
              shoppingListId: activeListItem?.shoppingListId ?? currentItem.shoppingListId,
              isBought,
              boughtAt: isBought ? currentTimestamp : undefined,
              updatedAt: currentTimestamp,
            };

            updatedItem = nextItem;

            await shoppingDatabase.items.put(nextItem);

            if (isBought) {
              await shoppingDatabase.purchaseEvents.add({
                id: createUuid(),
                shoppingListId: nextItem.shoppingListId,
                itemId: nextItem.id,
                itemName: nextItem.name,
                normalizedName: nextItem.normalizedName,
                categoryId: nextItem.categoryId,
                quantity: nextItem.quantity,
                unit: nextItem.unit,
                price: nextItem.price,
                boughtAt: currentTimestamp,
              });
            } else {
              const previousEvents = await shoppingDatabase.purchaseEvents
                .where("itemId")
                .equals(nextItem.id)
                .toArray();

              if (previousEvents.length > 0) {
                const previousEventIds = previousEvents.map((event) => event.id);
                const priceObservations = await shoppingDatabase.priceObservations
                  .where("purchaseEventId")
                  .anyOf(previousEventIds)
                  .toArray();

                if (priceObservations.length > 0) {
                  await shoppingDatabase.priceObservations.bulkDelete(
                    priceObservations.map((observation) => observation.id),
                  );
                }

                await shoppingDatabase.purchaseEvents.bulkDelete(
                  previousEventIds,
                );
              }
            }

            await shoppingDatabase.shoppingListMeta.update(nextItem.shoppingListId, {
              updatedAt: currentTimestamp,
            });

            await rebuildProductMemory(nextItem.normalizedName);
          },
        );

        await sync();
        return updatedItem;
      }),

    deleteItem: async (itemId: string): Promise<void> =>
      runWithError(async () => {
        await ensureReady();
        await shoppingDatabase.items.delete(itemId);
        await sync();
      }),

    deleteItems: async (itemIds: string[]): Promise<ShoppingItem[]> =>
      runWithError(async () => {
        await ensureReady();
        const uniqueItemIds = [...new Set(itemIds)];

        if (uniqueItemIds.length === 0) {
          return [];
        }

        const storedItems = await shoppingDatabase.items.bulkGet(uniqueItemIds);
        const deletedItems = storedItems.filter(
          (item): item is ShoppingItem => item !== undefined,
        );

        if (deletedItems.length > 0) {
          await shoppingDatabase.items.bulkDelete(deletedItems.map((item) => item.id));
        }

        await sync();
        return deletedItems;
      }),

    restoreItem: async (item: ShoppingItem): Promise<void> =>
      runWithError(async () => {
        await ensureReady();
        await restoreShoppingItems([item]);
        await sync();
      }),

    restoreItems: async (items: ShoppingItem[]): Promise<void> =>
      runWithError(async () => {
        await ensureReady();
        await restoreShoppingItems(items);
        await sync();
      }),

    updateItem: async (
      itemId: string,
      changes: ShoppingItemUpdate,
    ): Promise<ShoppingItem | null> =>
      runWithError(async () => {
        await ensureReady();
        let updatedItem: ShoppingItem | null = null;

        await shoppingDatabase.transaction(
          "rw",
          [
            shoppingDatabase.items,
            shoppingDatabase.purchaseEvents,
            shoppingDatabase.productMemory,
            shoppingDatabase.shoppingListMeta,
            shoppingDatabase.priceObservations,
          ],
          async () => {
            const currentItem = await shoppingDatabase.items.get(itemId);
            if (!currentItem) {
              return;
            }

            const nextName = changes.name ? capitalizeProductName(changes.name) : currentItem.name;
            const nextNormalizedName = changes.name
              ? normalizeProductName(changes.name) || currentItem.normalizedName
              : currentItem.normalizedName;
            const nextCategoryId = changes.categoryId ?? currentItem.categoryId;
            const nextItem: ShoppingItem = {
              ...currentItem,
              name: nextName,
              normalizedName: nextNormalizedName,
              quantity:
                changes.quantity === undefined
                  ? currentItem.quantity
                  : normalizeQuantity(changes.quantity),
              unit: changes.unit ? getCanonicalUnit(changes.unit) : currentItem.unit,
              categoryId: nextCategoryId,
              necessity: changes.necessity ?? currentItem.necessity,
              price: changes.price === undefined ? currentItem.price : normalizePrice(changes.price),
              updatedAt: Date.now(),
            };

            updatedItem = nextItem;

            await shoppingDatabase.items.put(nextItem);

            if (currentItem.isBought) {
              const itemEvents = await shoppingDatabase.purchaseEvents
                .where("itemId")
                .equals(nextItem.id)
                .toArray();
              const priceObservationIds = itemEvents.flatMap((event) =>
                event.priceObservationId ? [event.priceObservationId] : [],
              );
              const linkedPriceObservations =
                priceObservationIds.length > 0
                  ? await shoppingDatabase.priceObservations.bulkGet(priceObservationIds)
                  : [];
              const priceObservationsById = new Map(
                linkedPriceObservations.flatMap((observation) =>
                  observation ? [[observation.id, observation]] : [],
                ),
              );

              await Promise.all(
                itemEvents.map((event) => {
                  const linkedObservation = event.priceObservationId
                    ? priceObservationsById.get(event.priceObservationId)
                    : undefined;
                  const updatedEvent: PurchaseEvent = {
                    ...event,
                    itemName: nextItem.name,
                    normalizedName: nextItem.normalizedName,
                    categoryId: nextItem.categoryId,
                    quantity: nextItem.quantity,
                    unit: nextItem.unit,
                    price: nextItem.price,
                  };

                  return shoppingDatabase.purchaseEvents.put(
                    linkedObservation
                      ? {
                          ...updatedEvent,
                          actualAmountMinor: getActualLineAmountMinor(
                            updatedEvent,
                            linkedObservation,
                          ),
                          actualCurrency: linkedObservation.currency,
                        }
                      : updatedEvent,
                  );
                }),
              );

              const existingLinkedPriceObservations = linkedPriceObservations.filter(
                (observation): observation is PriceObservation => observation !== undefined,
              );

              if (existingLinkedPriceObservations.length > 0) {
                await shoppingDatabase.priceObservations.bulkPut(
                  existingLinkedPriceObservations.map((observation) => ({
                    ...observation,
                    itemName: nextItem.name,
                    normalizedName: nextItem.normalizedName,
                  })),
                );
              }

              await rebuildProductMemory(currentItem.normalizedName);
              if (nextNormalizedName !== currentItem.normalizedName) {
                await rebuildProductMemory(nextNormalizedName);
              }
            }

            if (changes.categoryId !== undefined) {
              await saveManualCategoryMemory(nextItem);
            }

            await shoppingDatabase.shoppingListMeta.update(nextItem.shoppingListId, {
              updatedAt: nextItem.updatedAt,
            });
          },
        );

        await sync();
        return updatedItem;
      }),

    updateItemQuantities: async (
      quantities: Record<string, number>,
    ): Promise<ShoppingItem[]> =>
      runWithError(async () => {
        await ensureReady();
        const quantityEntries = Object.entries(quantities);

        if (quantityEntries.length === 0) {
          return [];
        }

        if (
          quantityEntries.some(
            ([itemId, quantity]) =>
              !itemId.trim() || !Number.isFinite(quantity) || quantity <= 0,
          )
        ) {
          throw new Error("The item quantities are invalid.");
        }

        let updatedItems: ShoppingItem[] = [];

        await shoppingDatabase.transaction(
          "rw",
          [shoppingDatabase.items, shoppingDatabase.shoppingListMeta],
          async () => {
            const currentTimestamp = Date.now();
            const storedItems = await shoppingDatabase.items.bulkGet(
              quantityEntries.map(([itemId]) => itemId),
            );
            const quantitiesByItemId = new Map(quantityEntries);

            updatedItems = storedItems.flatMap((item) => {
              if (!item || item.isBought) {
                return [];
              }

              return [
                {
                  ...item,
                  quantity: normalizeQuantity(quantitiesByItemId.get(item.id)),
                  updatedAt: currentTimestamp,
                },
              ];
            });

            if (updatedItems.length === 0) {
              return;
            }

            await shoppingDatabase.items.bulkPut(updatedItems);
            await Promise.all(
              [...new Set(updatedItems.map((item) => item.shoppingListId))].map(
                (shoppingListId) =>
                  shoppingDatabase.shoppingListMeta.update(shoppingListId, {
                    updatedAt: currentTimestamp,
                  }),
              ),
            );
          },
        );

        await sync();
        return updatedItems;
      }),

    setItemNecessity: async (
      itemId: string,
      necessity: ItemNecessity,
    ): Promise<ShoppingItem | null> => get().updateItem(itemId, { necessity }),

    setItemCategory: async (itemId: string, categoryId: string): Promise<ShoppingItem | null> =>
      runWithError(async () => {
        await ensureReady();
        const category = await shoppingDatabase.categories.get(categoryId);

        if (!category) {
          throw new Error("The selected category was not found.");
        }

        return get().updateItem(itemId, { categoryId });
      }),

    setShoppingListBudget: async (
      shoppingListId: string,
      budgetAmountMinor: number | undefined,
      currency?: CurrencyCode,
    ): Promise<ShoppingListMeta> =>
      runWithError(async () => {
        await ensureReady();

        if (!shoppingListId.trim()) {
          throw new Error("The shopping list was not found.");
        }

        if (budgetAmountMinor !== undefined && !isNonNegativeInteger(budgetAmountMinor)) {
          throw new Error("The budget must be a non-negative integer amount.");
        }

        if (currency !== undefined && !isCurrencyCode(currency)) {
          throw new Error("The selected currency is not supported.");
        }

        let savedMeta: ShoppingListMeta | null = null;

        await shoppingDatabase.transaction(
          "rw",
          [
            shoppingDatabase.shoppingListMeta,
            shoppingDatabase.items,
            shoppingDatabase.purchaseEvents,
            shoppingDatabase.priceObservations,
            shoppingDatabase.settings,
          ],
          async () => {
            const [existingMeta, listItems, listEvents, listObservations, settings] =
              await Promise.all([
              shoppingDatabase.shoppingListMeta.get(shoppingListId),
              shoppingDatabase.items.where("shoppingListId").equals(shoppingListId).toArray(),
              shoppingDatabase.purchaseEvents
                .where("shoppingListId")
                .equals(shoppingListId)
                .toArray(),
              shoppingDatabase.priceObservations
                .where("shoppingListId")
                .equals(shoppingListId)
                .toArray(),
              shoppingDatabase.settings.get(SETTINGS_RECORD_ID),
              ]);

            if (!existingMeta && listItems.length === 0 && listEvents.length === 0) {
              throw new Error("The shopping list was not found.");
            }

            const currentTimestamp = Date.now();
            const activityTimestamps = [
              ...listItems.map((item) => item.createdAt),
              ...listEvents.map((event) => event.boughtAt),
            ];
            const createdAt =
              existingMeta?.createdAt ??
              (activityTimestamps.length > 0
                ? Math.min(...activityTimestamps)
                : currentTimestamp);
            const nextCurrency =
              currency ?? existingMeta?.currency ?? settings?.currency ?? "UAH";
            const recordedCurrencies = new Set([
              ...listObservations.map((observation) => observation.currency),
              ...listEvents.flatMap((event) =>
                event.actualCurrency === undefined ? [] : [event.actualCurrency],
              ),
            ]);

            if (
              recordedCurrencies.size > 0 &&
              [...recordedCurrencies].some(
                (recordedCurrency) => recordedCurrency !== nextCurrency,
              )
            ) {
              throw new Error("The list currency cannot change after a price is recorded.");
            }

            const nextMeta: ShoppingListMeta = {
              shoppingListId,
              budgetAmountMinor,
              currency: nextCurrency,
              countryCode: existingMeta?.countryCode ?? "UA",
              createdAt,
              updatedAt: currentTimestamp,
            };

            await shoppingDatabase.shoppingListMeta.put(nextMeta);
            savedMeta = nextMeta;
          },
        );

        if (!savedMeta) {
          throw new Error("The shopping list was not found.");
        }

        await sync();
        return savedMeta;
      }),

    savePriceObservation: async (
      input: PriceObservationInput,
    ): Promise<PriceObservation | null> =>
      runWithError(async () => {
        await ensureReady();

        if (
          !input.itemId.trim() ||
          !input.shoppingListId.trim() ||
          !isNonNegativeInteger(input.amountMinor) ||
          !isCurrencyCode(input.currency) ||
          !isPositiveFiniteNumber(input.packageQuantity) ||
          (input.source !== undefined &&
            input.source !== "manual" &&
            input.source !== "provider") ||
          (input.observedAt !== undefined && !isFiniteNumber(input.observedAt))
        ) {
          throw new Error("The price information is invalid.");
        }

        const packageUnit = normalizeShoppingUnit(input.packageUnit);

        if (!packageUnit) {
          throw new Error("The package unit is not supported.");
        }

        let savedObservation: PriceObservation | null = null;

        await shoppingDatabase.transaction(
          "rw",
          [
            shoppingDatabase.items,
            shoppingDatabase.purchaseEvents,
            shoppingDatabase.priceObservations,
            shoppingDatabase.shoppingListMeta,
          ],
          async () => {
            const [item, listMeta] = await Promise.all([
              shoppingDatabase.items.get(input.itemId),
              shoppingDatabase.shoppingListMeta.get(input.shoppingListId),
            ]);

            if (!listMeta) {
              throw new Error("The shopping list was not found.");
            }

            if (listMeta.currency !== input.currency) {
              throw new Error("Prices in different currencies cannot be combined.");
            }

            let purchaseEvent = input.purchaseEventId
              ? await shoppingDatabase.purchaseEvents.get(input.purchaseEventId)
              : undefined;

            if (input.purchaseEventId && !purchaseEvent) {
              throw new Error("The selected purchase was not found.");
            }

            if (!input.purchaseEventId && !purchaseEvent) {
              const itemEvents = await shoppingDatabase.purchaseEvents
                .where("itemId")
                .equals(input.itemId)
                .toArray();

              purchaseEvent = itemEvents
                .filter((event) => event.shoppingListId === input.shoppingListId)
                .sort(
                  (firstEvent, secondEvent) => secondEvent.boughtAt - firstEvent.boughtAt,
                )[0];
            }

            if (
              !purchaseEvent ||
              purchaseEvent.itemId !== input.itemId ||
              purchaseEvent.shoppingListId !== input.shoppingListId
            ) {
              return;
            }

            if (
              getUnitBasis(purchaseEvent.unit).dimension !==
              getUnitBasis(packageUnit).dimension
            ) {
              throw new Error("The package unit is not compatible with this item.");
            }

            const source = input.source ?? "manual";
            const linkedObservations = await shoppingDatabase.priceObservations
              .where("purchaseEventId")
              .equals(purchaseEvent.id)
              .toArray();
            const existingObservation = linkedObservations.find(
              (observation) => observation.source === source,
            );
            const observation: PriceObservation = {
              id: existingObservation?.id ?? createUuid(),
              shoppingListId: purchaseEvent.shoppingListId,
              countryCode: listMeta.countryCode,
              itemId: purchaseEvent.itemId,
              purchaseEventId: purchaseEvent.id,
              itemName: item?.name ?? purchaseEvent.itemName,
              normalizedName: item?.normalizedName ?? purchaseEvent.normalizedName,
              amountMinor: input.amountMinor,
              currency: input.currency,
              packageQuantity: input.packageQuantity,
              packageUnit,
              source,
              observedAt:
                input.observedAt ?? existingObservation?.observedAt ?? purchaseEvent.boughtAt,
            };

            await shoppingDatabase.priceObservations.put(observation);

            if (source === "manual") {
              const actualAmountMinor = getActualLineAmountMinor(purchaseEvent, observation);

              await shoppingDatabase.purchaseEvents.put({
                ...purchaseEvent,
                priceObservationId: observation.id,
                actualAmountMinor,
                actualCurrency: observation.currency,
              });
            }

            await shoppingDatabase.shoppingListMeta.update(observation.shoppingListId, {
              updatedAt: Date.now(),
            });
            savedObservation = observation;
          },
        );

        await sync();
        return savedObservation;
      }),

    addPantryItems: async (input: string): Promise<PantryItemsResult> =>
      runWithError(async () => {
        await ensureReady();
        const currentState = get();
        const knownProductNames = new Set([
          ...Object.keys(productDictionary),
          ...currentState.productMemory.map((memory) => memory.normalizedName),
          ...currentState.items.map((item) => item.normalizedName),
          ...currentState.pantryItems.map((item) => item.normalizedName),
        ]);
        const parsedItems = parsePantryInput(input, knownProductNames)
          .map(normalizePantryInput)
          .filter((item): item is PantryItemInput => item !== null);
        const uniqueItems = new Map<string, PantryItemInput>();

        for (const item of parsedItems) {
          const canonicalName = getCanonicalProductName(item.name);
          if (canonicalName && !uniqueItems.has(canonicalName)) {
            uniqueItems.set(canonicalName, item);
          }
        }

        const addedItems: PantryItem[] = [];
        let existingCount = parsedItems.length - uniqueItems.size;

        await shoppingDatabase.transaction(
          "rw",
          [
            shoppingDatabase.categories,
            shoppingDatabase.pantryItems,
            shoppingDatabase.productMemory,
          ],
          async () => {
            const categories = await shoppingDatabase.categories.toArray();

            for (const [canonicalName, item] of uniqueItems) {
              const existingItem = await shoppingDatabase.pantryItems
                .where("canonicalName")
                .equals(canonicalName)
                .first();

              if (existingItem) {
                existingCount += 1;
                continue;
              }

              const normalizedName = normalizeProductName(item.name);
              const currentTimestamp = Date.now();
              const pantryItem: PantryItem = {
                id: createUuid(),
                name: item.name,
                normalizedName,
                canonicalName,
                categoryId: await getAvailableCategoryId(
                  normalizedName,
                  categories,
                  item.categoryId,
                ),
                createdAt: currentTimestamp,
                updatedAt: currentTimestamp,
              };

              await shoppingDatabase.pantryItems.add(pantryItem);
              addedItems.push(pantryItem);
            }
          },
        );

        await sync();
        return { addedItems, existingCount };
      }),

    deletePantryItem: async (itemId: string): Promise<PantryItem | null> =>
      runWithError(async () => {
        await ensureReady();
        const pantryItem = await shoppingDatabase.pantryItems.get(itemId);

        if (!pantryItem) {
          return null;
        }

        await shoppingDatabase.pantryItems.delete(itemId);
        await sync();
        return pantryItem;
      }),

    restorePantryItem: async (item: PantryItem): Promise<void> =>
      runWithError(async () => {
        await ensureReady();
        await shoppingDatabase.transaction(
          "rw",
          [shoppingDatabase.categories, shoppingDatabase.pantryItems],
          async () => {
            const [existingItem, categories, itemCategory] = await Promise.all([
              shoppingDatabase.pantryItems
                .where("canonicalName")
                .equals(item.canonicalName)
                .first(),
              shoppingDatabase.categories.toArray(),
              shoppingDatabase.categories.get(item.categoryId),
            ]);

            if (existingItem) {
              return;
            }

            await shoppingDatabase.pantryItems.put({
              ...item,
              categoryId:
                itemCategory?.id ?? getFallbackCategoryId(categories),
              updatedAt: Date.now(),
            });
          },
        );

        await sync();
      }),

    addRecipeIngredients: async (
      items: ShoppingItemInput[],
      shoppingListId?: string,
    ): Promise<RecipeItemsResult> =>
      runWithError(async () => {
        await ensureReady();
        const activeCanonicalNames = new Set(
          get()
            .items.filter(
              (item) =>
                !item.isBought &&
                (shoppingListId === undefined || item.shoppingListId === shoppingListId),
            )
            .map((item) => getCanonicalProductName(item.name)),
        );
        const itemsToAdd: ShoppingItemInput[] = [];
        let skippedCount = 0;

        for (const item of items) {
          const normalizedItem = normalizePantryInput(item);
          const canonicalName = normalizedItem
            ? getCanonicalProductName(normalizedItem.name)
            : "";

          if (!normalizedItem || !canonicalName || activeCanonicalNames.has(canonicalName)) {
            skippedCount += 1;
            continue;
          }

          activeCanonicalNames.add(canonicalName);
          itemsToAdd.push({ ...item, name: normalizedItem.name });
        }

        const addedItems = await createItemsFromDrafts(itemsToAdd, {
          mergeExisting: false,
          shoppingListId,
        });
        skippedCount += itemsToAdd.length - addedItems.length;
        await sync();
        return { addedItems, skippedCount };
      }),

    clearBought: async (shoppingListId: string): Promise<ClearBoughtResult> =>
      runWithError(async () => {
        await ensureReady();

        if (!shoppingListId.trim()) {
          throw new Error("The shopping list was not found.");
        }

        let result: ClearBoughtResult = { clearedCount: 0, pantryAddedCount: 0 };

        await shoppingDatabase.transaction(
          "rw",
          [shoppingDatabase.items, shoppingDatabase.pantryItems],
          async () => {
            const boughtItems = (
              await shoppingDatabase.items
                .where("shoppingListId")
                .equals(shoppingListId)
                .toArray()
            ).filter((item) => item.isBought);

            if (boughtItems.length === 0) {
              return;
            }

            const boughtItemsByCanonicalName = new Map<string, ShoppingItem>();
            for (const item of boughtItems) {
              const canonicalName = getCanonicalProductName(item.name);
              const currentItem = boughtItemsByCanonicalName.get(canonicalName);

              if (
                canonicalName &&
                (!currentItem || (item.boughtAt ?? item.updatedAt) > (currentItem.boughtAt ?? currentItem.updatedAt))
              ) {
                boughtItemsByCanonicalName.set(canonicalName, item);
              }
            }

            const currentTimestamp = Date.now();
            for (const [canonicalName, item] of boughtItemsByCanonicalName) {
              const existingItem = await shoppingDatabase.pantryItems
                .where("canonicalName")
                .equals(canonicalName)
                .first();
              const lastPurchasedAt = item.boughtAt ?? currentTimestamp;

              await shoppingDatabase.pantryItems.put(
                existingItem
                  ? {
                      ...existingItem,
                      updatedAt: currentTimestamp,
                      lastPurchasedAt: Math.max(
                        existingItem.lastPurchasedAt ?? 0,
                        lastPurchasedAt,
                      ),
                    }
                  : {
                      id: createUuid(),
                      name: item.name,
                      normalizedName: item.normalizedName,
                      canonicalName,
                      categoryId: item.categoryId,
                      createdAt: currentTimestamp,
                      updatedAt: currentTimestamp,
                      lastPurchasedAt,
                    },
              );
            }

            await shoppingDatabase.items.bulkDelete(boughtItems.map((item) => item.id));
            result = {
              clearedCount: boughtItems.length,
              pantryAddedCount: boughtItemsByCanonicalName.size,
            };
          },
        );

        await sync();
        return result;
      }),

    clearItems: async (): Promise<void> =>
      runWithError(async () => {
        await ensureReady();
        await shoppingDatabase.items.clear();
        await sync();
      }),

    applyTemplate: async (template: ShoppingTemplate | string): Promise<ShoppingItem[]> =>
      runWithError(async () => {
        await ensureReady();
        const selectedTemplate =
          typeof template === "string"
            ? await shoppingDatabase.templates.get(template)
            : template;

        if (!selectedTemplate) {
          return [];
        }

        const savedItems = await createItemsFromDrafts(selectedTemplate.items);
        await sync();
        return savedItems;
      }),

    createTemplate: async (input: ShoppingTemplateInput): Promise<ShoppingTemplate | null> =>
      runWithError(async () => {
        await ensureReady();
        const name = input.name.trim();
        const items = normalizeTemplateItems(input.items);

        if (!name || items.length === 0) {
          return null;
        }

        const currentTimestamp = Date.now();
        const newTemplate: ShoppingTemplate = {
          id: createUuid(),
          name,
          items,
          createdAt: currentTimestamp,
          updatedAt: currentTimestamp,
        };

        await shoppingDatabase.templates.add(newTemplate);
        await sync();
        return newTemplate;
      }),

    updateTemplate: async (
      templateId: string,
      input: Partial<ShoppingTemplateInput>,
    ): Promise<ShoppingTemplate | null> =>
      runWithError(async () => {
        await ensureReady();
        const currentTemplate = await shoppingDatabase.templates.get(templateId);

        if (!currentTemplate) {
          return null;
        }

        const name = input.name === undefined ? currentTemplate.name : input.name.trim();
        const items = input.items === undefined ? currentTemplate.items : normalizeTemplateItems(input.items);

        if (!name || items.length === 0) {
          return null;
        }

        const updatedTemplate: ShoppingTemplate = {
          ...currentTemplate,
          name,
          items,
          updatedAt: Date.now(),
        };

        await shoppingDatabase.templates.put(updatedTemplate);
        await sync();
        return updatedTemplate;
      }),

    deleteTemplate: async (templateId: string): Promise<void> =>
      runWithError(async () => {
        await ensureReady();
        await shoppingDatabase.templates.delete(templateId);
        await sync();
      }),

    createCategory: async (name: string): Promise<ShoppingCategory | null> =>
      runWithError(async () => {
        await ensureReady();
        const normalizedName = name.trim();

        if (!normalizedName) {
          return null;
        }

        const categories = await shoppingDatabase.categories.toArray();
        const maximumSortOrder = categories.reduce(
          (maximum, category) => Math.max(maximum, category.sortOrder),
          0,
        );
        const newCategory: ShoppingCategory = {
          id: `custom-${createUuid()}`,
          name: normalizedName,
          sortOrder: maximumSortOrder + 10,
          isDefault: false,
        };

        await shoppingDatabase.categories.add(newCategory);
        await sync();
        return newCategory;
      }),

    updateCategory: async (
      categoryId: string,
      changes: CategoryUpdate,
    ): Promise<ShoppingCategory | null> =>
      runWithError(async () => {
        await ensureReady();
        const currentCategory = await shoppingDatabase.categories.get(categoryId);

        if (!currentCategory) {
          return null;
        }

        const name = changes.name === undefined ? currentCategory.name : changes.name.trim();
        if (!name) {
          return null;
        }

        const updatedCategory: ShoppingCategory = {
          ...currentCategory,
          name,
          sortOrder:
            typeof changes.sortOrder === "number" && Number.isFinite(changes.sortOrder)
              ? changes.sortOrder
              : currentCategory.sortOrder,
        };

        await shoppingDatabase.categories.put(updatedCategory);
        await sync();
        return updatedCategory;
      }),

    deleteCategory: async (categoryId: string): Promise<boolean> =>
      runWithError(async () => {
        await ensureReady();
        const categoryToDelete = await shoppingDatabase.categories.get(categoryId);

        if (!categoryToDelete || categoryToDelete.isDefault) {
          return false;
        }

        const fallbackCategoryId = getFallbackCategoryId(
          (await shoppingDatabase.categories.toArray()).filter(
            (category) => category.id !== categoryId,
          ),
        );

        await shoppingDatabase.transaction(
          "rw",
          [
            shoppingDatabase.categories,
            shoppingDatabase.items,
            shoppingDatabase.productMemory,
            shoppingDatabase.pantryItems,
            shoppingDatabase.purchaseEvents,
            shoppingDatabase.templates,
          ],
          async () => {
            await shoppingDatabase.categories.delete(categoryId);
            const currentTimestamp = Date.now();
            const items = await shoppingDatabase.items.where("categoryId").equals(categoryId).toArray();
            const memories = await shoppingDatabase.productMemory
              .where("categoryId")
              .equals(categoryId)
              .toArray();
            const pantryItems = await shoppingDatabase.pantryItems
              .where("categoryId")
              .equals(categoryId)
              .toArray();
            const purchaseEvents = await shoppingDatabase.purchaseEvents
              .where("categoryId")
              .equals(categoryId)
              .toArray();
            const templates = await shoppingDatabase.templates.toArray();

            await Promise.all([
              ...items.map((item) =>
                shoppingDatabase.items.put({
                  ...item,
                  categoryId: fallbackCategoryId,
                  updatedAt: currentTimestamp,
                }),
              ),
              ...memories.map((memory) =>
                shoppingDatabase.productMemory.put({
                  ...memory,
                  categoryId: fallbackCategoryId,
                }),
              ),
              ...pantryItems.map((item) =>
                shoppingDatabase.pantryItems.put({
                  ...item,
                  categoryId: fallbackCategoryId,
                  updatedAt: currentTimestamp,
                }),
              ),
              ...purchaseEvents.map((purchaseEvent) =>
                shoppingDatabase.purchaseEvents.put({
                  ...purchaseEvent,
                  categoryId: fallbackCategoryId,
                }),
              ),
              ...templates.map((template) => {
                const hasDeletedCategory = template.items.some(
                  (templateItem) => templateItem.categoryId === categoryId,
                );

                if (!hasDeletedCategory) {
                  return Promise.resolve(template.id);
                }

                return shoppingDatabase.templates.put({
                  ...template,
                  items: template.items.map((templateItem) =>
                    templateItem.categoryId === categoryId
                      ? { ...templateItem, categoryId: fallbackCategoryId }
                      : templateItem,
                  ),
                  updatedAt: currentTimestamp,
                });
              }),
            ]);
          },
        );

        await sync();
        return true;
      }),

    updateSettings: async (changes: SettingsUpdate): Promise<ShoppingSettings> =>
      runWithError(async () => {
        await ensureReady();
        const currentSettings =
          (await shoppingDatabase.settings.get(SETTINGS_RECORD_ID)) ?? createDefaultSettings(Date.now());
        const updatedSettings: ShoppingSettings = {
          ...currentSettings,
          ...changes,
          id: SETTINGS_RECORD_ID,
          updatedAt: Date.now(),
        };

        await shoppingDatabase.settings.put(updatedSettings);
        await sync();
        return updatedSettings;
      }),

    exportData: async (): Promise<ShoppingBackup> =>
      runWithError(async () => {
        await ensureReady();
        const snapshot = await readShoppingDatabaseSnapshot();

        return {
          version: 4,
          exportedAt: Date.now(),
          categories: snapshot.categories,
          items: snapshot.items,
          shoppingListMeta: snapshot.shoppingListMeta,
          priceObservations: snapshot.priceObservations,
          productMemory: snapshot.productMemory,
          pantryItems: snapshot.pantryItems,
          templates: snapshot.templates,
          settings: [snapshot.settings],
          purchaseEvents: snapshot.purchaseEvents,
        };
      }),

    importData: async (data: unknown): Promise<void> =>
      runWithError(async () => {
        await ensureReady();
        const backup = parseShoppingBackup(data);

        await replaceShoppingDatabase(backup);
        await sync();
      }),

    resetData: async (): Promise<void> =>
      runWithError(async () => {
        set({ isLoading: true });

        try {
          await resetShoppingDatabase();
          await sync();
          set({ isReady: true, isLoading: false });
        } catch (error) {
          set({ isLoading: false, error: getErrorMessage(error) });
          throw error;
        }
      }),
  };
});
