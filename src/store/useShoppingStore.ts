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
  resetShoppingDatabase,
  shoppingDatabase,
} from "../db/database";
import type {
  CurrencyCode,
  ItemNecessity,
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
import { capitalizeProductName, createUuid } from "../lib/format";
import {
  normalizeShoppingUnit,
  normalizeProductName,
  parseShoppingInput,
} from "../lib/parseShoppingInput";

type SettingsUpdate = Partial<Omit<ShoppingSettings, "id" | "updatedAt">>;
type CategoryUpdate = Partial<Pick<ShoppingCategory, "name" | "sortOrder">>;
type ItemDraft = ShoppingItemInput & { normalizedName?: string };
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
  updateItemQuantity: (itemId: string, quantity: number) => Promise<ShoppingItem | null>;
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
  clearBought: () => Promise<void>;
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

const createItemsFromDrafts = async (drafts: ItemDraft[]): Promise<ShoppingItem[]> => {
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
      const activeListItem = currentItems.find((item) => !item.isBought);
      const shoppingListId = activeListItem?.shoppingListId ?? createUuid();

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
          (item) => !item.isBought && item.unit === unit,
        );
        const currentTimestamp = Date.now();

        if (existingItem) {
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
      shoppingDatabase.purchaseEvents,
      shoppingDatabase.shoppingListMeta,
      shoppingDatabase.settings,
    ],
    async () => {
      const [currentItems, settings] = await Promise.all([
        shoppingDatabase.items.toArray(),
        shoppingDatabase.settings.get(SETTINGS_RECORD_ID),
      ]);
      let activeShoppingListId = currentItems.find((item) => !item.isBought)?.shoppingListId;
      const currentTimestamp = Date.now();

      for (const item of items) {
        if (!item.isBought && !activeShoppingListId) {
          activeShoppingListId = item.shoppingListId;
        }

        const shoppingListId = item.isBought
          ? item.shoppingListId
          : (activeShoppingListId ?? item.shoppingListId);
        const restoredItem: ShoppingItem = {
          ...item,
          shoppingListId,
          necessity: item.necessity ?? "required",
          updatedAt: currentTimestamp,
        };

        await shoppingDatabase.items.put(restoredItem);

        if (restoredItem.isBought) {
          const purchaseEvents = await shoppingDatabase.purchaseEvents
            .where("itemId")
            .equals(restoredItem.id)
            .toArray();

          if (purchaseEvents.length > 0) {
            await shoppingDatabase.purchaseEvents.bulkPut(
              purchaseEvents.map((purchaseEvent) => ({
                ...purchaseEvent,
                shoppingListId,
              })),
            );
          }
        }

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

const isShoppingCategory = (value: unknown): value is ShoppingCategory =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  isFiniteNumber(value.sortOrder) &&
  typeof value.isDefault === "boolean";

const isShoppingItem = (value: unknown): value is ImportedShoppingItem =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.shoppingListId === undefined || typeof value.shoppingListId === "string") &&
  typeof value.name === "string" &&
  typeof value.normalizedName === "string" &&
  isFiniteNumber(value.quantity) &&
  normalizeShoppingUnit(value.unit) !== null &&
  typeof value.categoryId === "string" &&
  (value.necessity === undefined || isItemNecessity(value.necessity)) &&
  typeof value.isBought === "boolean" &&
  isFiniteNumber(value.createdAt) &&
  isFiniteNumber(value.updatedAt) &&
  (value.price === undefined || isFiniteNumber(value.price)) &&
  (value.boughtAt === undefined || isFiniteNumber(value.boughtAt));

const isTemplateItem = (value: unknown): value is TemplateItem =>
  isRecord(value) &&
  typeof value.name === "string" &&
  typeof value.normalizedName === "string" &&
  isFiniteNumber(value.quantity) &&
  normalizeShoppingUnit(value.unit) !== null &&
  typeof value.categoryId === "string";

const isShoppingTemplate = (value: unknown): value is ShoppingTemplate =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  Array.isArray(value.items) &&
  value.items.every(isTemplateItem) &&
  isFiniteNumber(value.createdAt) &&
  isFiniteNumber(value.updatedAt) &&
  (value.isStarter === undefined || typeof value.isStarter === "boolean");

const isShoppingSettings = (value: unknown): value is ShoppingSettings =>
  isRecord(value) &&
  value.id === SETTINGS_RECORD_ID &&
  (value.theme === "system" || value.theme === "light" || value.theme === "dark") &&
  (value.language === "ru" || value.language === "uk" || value.language === "en") &&
  typeof value.hideBoughtItems === "boolean" &&
  typeof value.groupByCategory === "boolean" &&
  typeof value.enableAiSuggestions === "boolean" &&
  typeof value.enableLocalMlTraining === "boolean" &&
  (value.currency === "UAH" ||
    value.currency === "USD" ||
    value.currency === "EUR" ||
    value.currency === "PLN") &&
  isFiniteNumber(value.updatedAt);

const isPurchaseEvent = (value: unknown): value is ImportedPurchaseEvent =>
  isRecord(value) &&
  typeof value.id === "string" &&
  (value.shoppingListId === undefined || typeof value.shoppingListId === "string") &&
  typeof value.itemId === "string" &&
  typeof value.itemName === "string" &&
  typeof value.normalizedName === "string" &&
  typeof value.categoryId === "string" &&
  isFiniteNumber(value.quantity) &&
  normalizeShoppingUnit(value.unit) !== null &&
  (value.price === undefined || isFiniteNumber(value.price)) &&
  (value.priceObservationId === undefined || typeof value.priceObservationId === "string") &&
  (value.actualAmountMinor === undefined || isNonNegativeInteger(value.actualAmountMinor)) &&
  (value.actualCurrency === undefined || isCurrencyCode(value.actualCurrency)) &&
  isFiniteNumber(value.boughtAt);

const isShoppingListMeta = (value: unknown): value is ShoppingListMeta =>
  isRecord(value) &&
  typeof value.shoppingListId === "string" &&
  value.shoppingListId.trim().length > 0 &&
  (value.budgetAmountMinor === undefined || isNonNegativeInteger(value.budgetAmountMinor)) &&
  isCurrencyCode(value.currency) &&
  typeof value.countryCode === "string" &&
  value.countryCode.trim().length > 0 &&
  isFiniteNumber(value.createdAt) &&
  isFiniteNumber(value.updatedAt);

const isPriceObservation = (value: unknown): value is ImportedPriceObservation =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.shoppingListId === "string" &&
  value.shoppingListId.trim().length > 0 &&
  (value.countryCode === undefined ||
    (typeof value.countryCode === "string" && value.countryCode.trim().length > 0)) &&
  typeof value.itemId === "string" &&
  (value.purchaseEventId === undefined || typeof value.purchaseEventId === "string") &&
  typeof value.itemName === "string" &&
  typeof value.normalizedName === "string" &&
  isNonNegativeInteger(value.amountMinor) &&
  isCurrencyCode(value.currency) &&
  isPositiveFiniteNumber(value.packageQuantity) &&
  normalizeShoppingUnit(value.packageUnit) !== null &&
  (value.source === "manual" || value.source === "provider") &&
  isFiniteNumber(value.observedAt);

const isProductMemory = (value: unknown): value is ProductMemory =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.normalizedName === "string" &&
  typeof value.categoryId === "string" &&
  isFiniteNumber(value.defaultQuantity) &&
  normalizeShoppingUnit(value.defaultUnit) !== null &&
  isFiniteNumber(value.buyCount) &&
  isRecord(value.relatedItems) &&
  Object.values(value.relatedItems).every(isFiniteNumber) &&
  (value.lastBoughtAt === undefined || isFiniteNumber(value.lastBoughtAt)) &&
  (value.averageIntervalDays === undefined || isFiniteNumber(value.averageIntervalDays)) &&
  (value.averagePrice === undefined || isFiniteNumber(value.averagePrice));

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

const parseBackup = (value: unknown): ShoppingBackup => {
  if (
    !isRecord(value) ||
    (value.version !== 1 && value.version !== 2 && value.version !== 3) ||
    !isFiniteNumber(value.exportedAt) ||
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
    value.version === 3 &&
    (!Array.isArray(value.shoppingListMeta) || !Array.isArray(value.priceObservations))
  ) {
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

  const backupVersion = value.version;
  const importedItems = value.items as ImportedShoppingItem[];
  const importedPurchaseEvents = value.purchaseEvents as ImportedPurchaseEvent[];
  const importedShoppingListMeta =
    backupVersion === 3 ? (value.shoppingListMeta as unknown[]) : [];
  const importedPriceObservations =
    backupVersion === 3 ? (value.priceObservations as unknown[]) : [];

  if (
    backupVersion >= 2 &&
    (!importedItems.every(hasShoppingListId) || !importedPurchaseEvents.every(hasShoppingListId))
  ) {
    throw new Error("The import file contains unsupported data.");
  }

  if (
    backupVersion === 3 &&
    (!importedItems.every(hasItemNecessity) ||
      !importedShoppingListMeta.every(isShoppingListMeta) ||
      !importedPriceObservations.every(isPriceObservation))
  ) {
    throw new Error("The import file contains unsupported data.");
  }

  const currentShoppingListId = createUuid();
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
      shoppingListId:
        backupVersion >= 2 && hasShoppingListId(item)
          ? item.shoppingListId
          : currentShoppingListId,
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

  return {
    version: 3,
    exportedAt: value.exportedAt,
    categories: value.categories,
    items,
    shoppingListMeta: [...shoppingListMetaById.values()],
    priceObservations,
    productMemory: value.productMemory.map((memory) => ({
      ...memory,
      defaultUnit: getCanonicalUnit(memory.defaultUnit),
    })),
    templates: value.templates.map((template) => ({
      ...template,
      items: template.items.map((item) => ({
        ...item,
        unit: getCanonicalUnit(item.unit),
      })),
    })),
    settings: value.settings,
    purchaseEvents: normalizedPurchaseEvents,
  };
};

export const useShoppingStore = create<ShoppingStoreState>((set, get) => {
  const sync = async (): Promise<void> => {
    const snapshot = await readShoppingDatabaseSnapshot();

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
    });
  };

  const ensureReady = async (): Promise<void> => {
    if (!get().isReady) {
      await get().initialize();
    }
  };

  const runWithError = async <Result,>(operation: () => Promise<Result>): Promise<Result> => {
    try {
      set({ error: null });
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
                    shoppingListId: nextItem.shoppingListId,
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

    updateItemQuantity: async (
      itemId: string,
      quantity: number,
    ): Promise<ShoppingItem | null> => get().updateItem(itemId, { quantity }),

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

            if (!purchaseEvent) {
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

    clearBought: async (): Promise<void> =>
      runWithError(async () => {
        await ensureReady();
        const boughtItems = (await shoppingDatabase.items.toArray()).filter((item) => item.isBought);

        if (boughtItems.length > 0) {
          await shoppingDatabase.items.bulkDelete(boughtItems.map((item) => item.id));
        }

        await sync();
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
          [shoppingDatabase.categories, shoppingDatabase.items, shoppingDatabase.productMemory],
          async () => {
            await shoppingDatabase.categories.delete(categoryId);
            const items = await shoppingDatabase.items.where("categoryId").equals(categoryId).toArray();
            const memories = await shoppingDatabase.productMemory
              .where("categoryId")
              .equals(categoryId)
              .toArray();

            await Promise.all([
              ...items.map((item) =>
                shoppingDatabase.items.put({
                  ...item,
                  categoryId: fallbackCategoryId,
                  updatedAt: Date.now(),
                }),
              ),
              ...memories.map((memory) =>
                shoppingDatabase.productMemory.put({
                  ...memory,
                  categoryId: fallbackCategoryId,
                }),
              ),
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
          version: 3,
          exportedAt: Date.now(),
          categories: snapshot.categories,
          items: snapshot.items,
          shoppingListMeta: snapshot.shoppingListMeta,
          priceObservations: snapshot.priceObservations,
          productMemory: snapshot.productMemory,
          templates: snapshot.templates,
          settings: [snapshot.settings],
          purchaseEvents: snapshot.purchaseEvents,
        };
      }),

    importData: async (data: unknown): Promise<void> =>
      runWithError(async () => {
        await ensureReady();
        const backup = parseBackup(data);

        await shoppingDatabase.transaction(
          "rw",
          [
            shoppingDatabase.categories,
            shoppingDatabase.items,
            shoppingDatabase.templates,
            shoppingDatabase.settings,
            shoppingDatabase.purchaseEvents,
            shoppingDatabase.productMemory,
            shoppingDatabase.shoppingListMeta,
            shoppingDatabase.priceObservations,
          ],
          async () => {
            await Promise.all([
              shoppingDatabase.categories.clear(),
              shoppingDatabase.items.clear(),
              shoppingDatabase.templates.clear(),
              shoppingDatabase.settings.clear(),
              shoppingDatabase.purchaseEvents.clear(),
              shoppingDatabase.productMemory.clear(),
              shoppingDatabase.shoppingListMeta.clear(),
              shoppingDatabase.priceObservations.clear(),
            ]);

            if (backup.categories.length > 0) {
              await shoppingDatabase.categories.bulkPut(backup.categories);
            }
            if (backup.items.length > 0) {
              await shoppingDatabase.items.bulkPut(backup.items);
            }
            if (backup.shoppingListMeta.length > 0) {
              await shoppingDatabase.shoppingListMeta.bulkPut(backup.shoppingListMeta);
            }
            if (backup.priceObservations.length > 0) {
              await shoppingDatabase.priceObservations.bulkPut(backup.priceObservations);
            }
            if (backup.productMemory.length > 0) {
              await shoppingDatabase.productMemory.bulkPut(backup.productMemory);
            }
            if (backup.templates.length > 0) {
              await shoppingDatabase.templates.bulkPut(backup.templates);
            }
            if (backup.settings.length > 0) {
              await shoppingDatabase.settings.bulkPut(backup.settings);
            }
            if (backup.purchaseEvents.length > 0) {
              await shoppingDatabase.purchaseEvents.bulkPut(backup.purchaseEvents);
            }
          },
        );

        await ensureDatabaseDefaults();
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
