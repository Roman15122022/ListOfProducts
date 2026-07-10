import Dexie, { type Table } from "dexie";

import { createDefaultSettings, createStarterTemplates, defaultCategories } from "../data/catalog";
import type {
  PriceObservation,
  ProductMemory,
  PurchaseEvent,
  ShoppingCategory,
  ShoppingItem,
  ShoppingListMeta,
  ShoppingSettings,
  ShoppingTemplate,
  TemplateItem,
} from "../domain/types";
import { createUuid } from "../lib/format";
import { normalizeShoppingUnit } from "../lib/parseShoppingInput";

export const SETTINGS_RECORD_ID = "app-settings" as const;

const getMigratedUnit = (unit: unknown) => {
  const normalizedUnit = normalizeShoppingUnit(unit);

  return normalizedUnit !== null && normalizedUnit !== unit ? normalizedUnit : undefined;
};

const migrateTemplateItems = (templateItems: TemplateItem[]): TemplateItem[] => {
  let hasMigratedUnit = false;
  const migratedTemplateItems = templateItems.map((templateItem) => {
    const migratedUnit = getMigratedUnit(templateItem.unit);

    if (!migratedUnit) {
      return templateItem;
    }

    hasMigratedUnit = true;
    return { ...templateItem, unit: migratedUnit };
  });

  return hasMigratedUnit ? migratedTemplateItems : templateItems;
};

const getLocalDateKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export class ShoppingDatabase extends Dexie {
  categories!: Table<ShoppingCategory, string>;
  items!: Table<ShoppingItem, string>;
  templates!: Table<ShoppingTemplate, string>;
  settings!: Table<ShoppingSettings, string>;
  purchaseEvents!: Table<PurchaseEvent, string>;
  productMemory!: Table<ProductMemory, string>;
  shoppingListMeta!: Table<ShoppingListMeta, string>;
  priceObservations!: Table<PriceObservation, string>;

  constructor() {
    super("smart-shopping-list");

    this.version(1).stores({
      categories: "id, sortOrder, name",
      items: "id, normalizedName, categoryId, isBought, createdAt, updatedAt, boughtAt",
      templates: "id, createdAt, updatedAt",
      settings: "id",
      purchaseEvents: "id, itemId, normalizedName, categoryId, boughtAt",
      productMemory: "id, &normalizedName, categoryId, lastBoughtAt",
    });

    this.version(2)
      .stores({
        categories: "id, sortOrder, name",
        items: "id, normalizedName, categoryId, isBought, createdAt, updatedAt, boughtAt",
        templates: "id, createdAt, updatedAt",
        settings: "id",
        purchaseEvents: "id, itemId, normalizedName, categoryId, boughtAt",
        productMemory: "id, &normalizedName, categoryId, lastBoughtAt",
      })
      .upgrade(async (transaction) => {
        const currentTimestamp = Date.now();
        const categoriesTable = transaction.table<ShoppingCategory, string>("categories");
        const itemsTable = transaction.table<ShoppingItem, string>("items");
        const templatesTable = transaction.table<ShoppingTemplate, string>("templates");
        const purchaseEventsTable = transaction.table<PurchaseEvent, string>("purchaseEvents");
        const productMemoryTable = transaction.table<ProductMemory, string>("productMemory");

        const existingCategoriesById = new Map(
          (await categoriesTable.toArray()).map((category) => [category.id, category]),
        );
        const categoriesToAdd: ShoppingCategory[] = [];
        const categoriesToRefresh: ShoppingCategory[] = [];

        for (const defaultCategory of defaultCategories) {
          const existingCategory = existingCategoriesById.get(defaultCategory.id);

          if (!existingCategory) {
            categoriesToAdd.push({ ...defaultCategory });
            continue;
          }

          if (existingCategory.isDefault) {
            categoriesToRefresh.push({
              ...existingCategory,
              name: defaultCategory.name,
              sortOrder: defaultCategory.sortOrder,
            });
          }
        }

        if (categoriesToAdd.length > 0) {
          await categoriesTable.bulkAdd(categoriesToAdd);
        }

        if (categoriesToRefresh.length > 0) {
          await categoriesTable.bulkPut(categoriesToRefresh);
        }

        const starterTemplatesById = new Map(
          createStarterTemplates(currentTimestamp).map((template) => [template.id, template]),
        );
        const existingTemplates = await templatesTable.toArray();
        const templatesToUpdate = existingTemplates.flatMap((existingTemplate) => {
          const starterTemplate = existingTemplate.isStarter
            ? starterTemplatesById.get(existingTemplate.id)
            : undefined;
          const refreshedTemplate = starterTemplate
            ? {
                ...starterTemplate,
                createdAt: existingTemplate.createdAt,
                updatedAt: currentTimestamp,
              }
            : existingTemplate;
          const migratedTemplateItems = migrateTemplateItems(refreshedTemplate.items);

          if (
            refreshedTemplate === existingTemplate &&
            migratedTemplateItems === existingTemplate.items
          ) {
            return [];
          }

          return [
            migratedTemplateItems === refreshedTemplate.items
              ? refreshedTemplate
              : { ...refreshedTemplate, items: migratedTemplateItems },
          ];
        });

        if (templatesToUpdate.length > 0) {
          await templatesTable.bulkPut(templatesToUpdate);
        }

        const existingItems = await itemsTable.toArray();
        const itemsToUpdate = existingItems.flatMap((item) => {
          const migratedUnit = getMigratedUnit(item.unit);

          return migratedUnit ? [{ ...item, unit: migratedUnit }] : [];
        });

        if (itemsToUpdate.length > 0) {
          await itemsTable.bulkPut(itemsToUpdate);
        }

        const existingPurchaseEvents = await purchaseEventsTable.toArray();
        const purchaseEventsToUpdate = existingPurchaseEvents.flatMap((purchaseEvent) => {
          const migratedUnit = getMigratedUnit(purchaseEvent.unit);

          return migratedUnit ? [{ ...purchaseEvent, unit: migratedUnit }] : [];
        });

        if (purchaseEventsToUpdate.length > 0) {
          await purchaseEventsTable.bulkPut(purchaseEventsToUpdate);
        }

        const existingProductMemory = await productMemoryTable.toArray();
        const productMemoryToUpdate = existingProductMemory.flatMap((productMemory) => {
          const migratedUnit = getMigratedUnit(productMemory.defaultUnit);

          return migratedUnit ? [{ ...productMemory, defaultUnit: migratedUnit }] : [];
        });

        if (productMemoryToUpdate.length > 0) {
          await productMemoryTable.bulkPut(productMemoryToUpdate);
        }

      });

    this.version(3)
      .stores({
        categories: "id, sortOrder, name",
        items: "id, normalizedName, categoryId, isBought, createdAt, updatedAt, boughtAt",
        templates: "id, createdAt, updatedAt",
        settings: "id",
        purchaseEvents: "id, itemId, normalizedName, categoryId, boughtAt",
        productMemory: "id, &normalizedName, categoryId, lastBoughtAt",
      })
      .upgrade(async (transaction) => {
        const settingsTable = transaction.table<ShoppingSettings, string>("settings");
        const existingSettings = await settingsTable.get(SETTINGS_RECORD_ID);

        if (existingSettings?.language === "ru") {
          await settingsTable.update(SETTINGS_RECORD_ID, {
            language: "en",
            updatedAt: Date.now(),
          });
        }
      });

    this.version(4)
      .stores({
        categories: "id, sortOrder, name",
        items:
          "id, shoppingListId, normalizedName, categoryId, isBought, createdAt, updatedAt, boughtAt",
        templates: "id, createdAt, updatedAt",
        settings: "id",
        purchaseEvents:
          "id, shoppingListId, itemId, normalizedName, categoryId, boughtAt",
        productMemory: "id, &normalizedName, categoryId, lastBoughtAt",
      })
      .upgrade(async (transaction) => {
        const itemsTable = transaction.table<ShoppingItem, string>("items");
        const purchaseEventsTable = transaction.table<PurchaseEvent, string>("purchaseEvents");
        const existingItems = await itemsTable.toArray();
        const currentShoppingListId = existingItems.length > 0 ? createUuid() : undefined;

        if (currentShoppingListId) {
          await itemsTable.bulkPut(
            existingItems.map((item) => ({
              ...item,
              shoppingListId: currentShoppingListId,
            })),
          );
        }

        const currentItemIds = new Set(existingItems.map((item) => item.id));
        const shoppingListIdsByDate = new Map<string, string>();
        const existingPurchaseEvents = await purchaseEventsTable.toArray();
        const migratedPurchaseEvents = existingPurchaseEvents.map((purchaseEvent) => {
          if (currentShoppingListId && currentItemIds.has(purchaseEvent.itemId)) {
            return {
              ...purchaseEvent,
              shoppingListId: currentShoppingListId,
            };
          }

          const localDateKey = getLocalDateKey(purchaseEvent.boughtAt);
          const shoppingListId = shoppingListIdsByDate.get(localDateKey) ?? createUuid();
          shoppingListIdsByDate.set(localDateKey, shoppingListId);

          return {
            ...purchaseEvent,
            shoppingListId,
          };
        });

        if (migratedPurchaseEvents.length > 0) {
          await purchaseEventsTable.bulkPut(migratedPurchaseEvents);
        }
      });

    this.version(5)
      .stores({
        categories: "id, sortOrder, name",
        items:
          "id, shoppingListId, normalizedName, categoryId, necessity, isBought, createdAt, updatedAt, boughtAt",
        templates: "id, createdAt, updatedAt",
        settings: "id",
        purchaseEvents:
          "id, shoppingListId, itemId, normalizedName, categoryId, boughtAt",
        productMemory: "id, &normalizedName, categoryId, lastBoughtAt",
        shoppingListMeta:
          "shoppingListId, currency, countryCode, createdAt, updatedAt",
        priceObservations:
          "id, shoppingListId, itemId, purchaseEventId, normalizedName, currency, [normalizedName+currency+packageUnit], source, observedAt",
      })
      .upgrade(async (transaction) => {
        const itemsTable = transaction.table<ShoppingItem, string>("items");
        const purchaseEventsTable = transaction.table<PurchaseEvent, string>("purchaseEvents");
        const settingsTable = transaction.table<ShoppingSettings, string>("settings");
        const shoppingListMetaTable = transaction.table<ShoppingListMeta, string>(
          "shoppingListMeta",
        );
        const [existingItems, existingPurchaseEvents, existingSettings] = await Promise.all([
          itemsTable.toArray(),
          purchaseEventsTable.toArray(),
          settingsTable.get(SETTINGS_RECORD_ID),
        ]);
        const migratedItems = existingItems.map((item) => ({
          ...item,
          necessity:
            item.necessity === "optional" || item.necessity === "required"
              ? item.necessity
              : "required",
        }));

        if (migratedItems.length > 0) {
          await itemsTable.bulkPut(migratedItems);
        }

        const listTimestamps = new Map<string, { createdAt: number; updatedAt: number }>();
        const includeListTimestamp = (
          shoppingListId: string,
          createdAt: number,
          updatedAt: number,
        ): void => {
          const currentTimestamps = listTimestamps.get(shoppingListId);

          listTimestamps.set(shoppingListId, {
            createdAt: Math.min(currentTimestamps?.createdAt ?? createdAt, createdAt),
            updatedAt: Math.max(currentTimestamps?.updatedAt ?? updatedAt, updatedAt),
          });
        };

        for (const item of migratedItems) {
          includeListTimestamp(item.shoppingListId, item.createdAt, item.updatedAt);
        }

        for (const purchaseEvent of existingPurchaseEvents) {
          includeListTimestamp(
            purchaseEvent.shoppingListId,
            purchaseEvent.boughtAt,
            purchaseEvent.boughtAt,
          );
        }

        const currency = existingSettings?.currency ?? "UAH";
        const migratedShoppingListMeta = [...listTimestamps].map(
          ([shoppingListId, timestamps]): ShoppingListMeta => ({
            shoppingListId,
            currency,
            countryCode: "UA",
            createdAt: timestamps.createdAt,
            updatedAt: timestamps.updatedAt,
          }),
        );

        if (migratedShoppingListMeta.length > 0) {
          await shoppingListMetaTable.bulkPut(migratedShoppingListMeta);
        }
      });
  }
}

export const shoppingDatabase = new ShoppingDatabase();

export interface ShoppingDatabaseSnapshot {
  categories: ShoppingCategory[];
  items: ShoppingItem[];
  templates: ShoppingTemplate[];
  settings: ShoppingSettings;
  purchaseEvents: PurchaseEvent[];
  productMemory: ProductMemory[];
  shoppingListMeta: ShoppingListMeta[];
  priceObservations: PriceObservation[];
}

export const ensureDatabaseDefaults = async (): Promise<void> => {
  await shoppingDatabase.transaction(
    "rw",
    [
      shoppingDatabase.categories,
      shoppingDatabase.templates,
      shoppingDatabase.settings,
      shoppingDatabase.shoppingListMeta,
      shoppingDatabase.priceObservations,
    ],
    async () => {
      const currentTimestamp = Date.now();
      const existingCategoriesById = new Map(
        (await shoppingDatabase.categories.toArray()).map((category) => [category.id, category]),
      );
      const missingCategories: ShoppingCategory[] = [];
      const refreshedCategories: ShoppingCategory[] = [];

      for (const defaultCategory of defaultCategories) {
        const existingCategory = existingCategoriesById.get(defaultCategory.id);

        if (!existingCategory) {
          missingCategories.push({ ...defaultCategory });
          continue;
        }

        if (existingCategory.isDefault) {
          refreshedCategories.push({
            ...existingCategory,
            name: defaultCategory.name,
            sortOrder: defaultCategory.sortOrder,
          });
        }
      }

      if (missingCategories.length > 0) {
        await shoppingDatabase.categories.bulkAdd(missingCategories);
      }

      if (refreshedCategories.length > 0) {
        await shoppingDatabase.categories.bulkPut(refreshedCategories);
      }

      const starterTemplates = createStarterTemplates(currentTimestamp);
      const existingTemplatesById = new Map(
        (await shoppingDatabase.templates.toArray()).map((template) => [template.id, template]),
      );
      const missingTemplates: ShoppingTemplate[] = [];
      const refreshedTemplates: ShoppingTemplate[] = [];

      for (const starterTemplate of starterTemplates) {
        const existingTemplate = existingTemplatesById.get(starterTemplate.id);

        if (!existingTemplate) {
          missingTemplates.push(starterTemplate);
          continue;
        }

        if (existingTemplate.isStarter) {
          refreshedTemplates.push({
            ...starterTemplate,
            createdAt: existingTemplate.createdAt,
          });
        }
      }

      if (missingTemplates.length > 0) {
        await shoppingDatabase.templates.bulkAdd(missingTemplates);
      }

      if (refreshedTemplates.length > 0) {
        await shoppingDatabase.templates.bulkPut(refreshedTemplates);
      }

      const existingSettings = await shoppingDatabase.settings.get(SETTINGS_RECORD_ID);

      if (!existingSettings) {
        await shoppingDatabase.settings.add(createDefaultSettings(currentTimestamp));
      } else if (existingSettings.language === "ru") {
        await shoppingDatabase.settings.update(SETTINGS_RECORD_ID, {
          language: "en",
          updatedAt: currentTimestamp,
        });
      }

      const listMetaById = new Map(
        (await shoppingDatabase.shoppingListMeta.toArray()).map((meta) => [
          meta.shoppingListId,
          meta,
        ]),
      );
      const observationsToUpdate = (await shoppingDatabase.priceObservations.toArray())
        .filter((observation) => !observation.countryCode)
        .map((observation) => ({
          ...observation,
          countryCode:
            listMetaById.get(observation.shoppingListId)?.countryCode ?? "UA",
        }));

      if (observationsToUpdate.length > 0) {
        await shoppingDatabase.priceObservations.bulkPut(observationsToUpdate);
      }
    },
  );
};

export const readShoppingDatabaseSnapshot = async (): Promise<ShoppingDatabaseSnapshot> => {
  const [
    categories,
    items,
    templates,
    settings,
    purchaseEvents,
    productMemory,
    shoppingListMeta,
    priceObservations,
  ] = await Promise.all([
    shoppingDatabase.categories.toArray(),
    shoppingDatabase.items.toArray(),
    shoppingDatabase.templates.toArray(),
    shoppingDatabase.settings.get(SETTINGS_RECORD_ID),
    shoppingDatabase.purchaseEvents.toArray(),
    shoppingDatabase.productMemory.toArray(),
    shoppingDatabase.shoppingListMeta.toArray(),
    shoppingDatabase.priceObservations.toArray(),
  ]);

  if (!settings) {
    await ensureDatabaseDefaults();
    return readShoppingDatabaseSnapshot();
  }

  return {
    categories: [...categories].sort((firstCategory, secondCategory) => {
      return firstCategory.sortOrder - secondCategory.sortOrder;
    }),
    items: [...items].sort((firstItem, secondItem) => {
      if (firstItem.isBought !== secondItem.isBought) {
        return Number(firstItem.isBought) - Number(secondItem.isBought);
      }

      return firstItem.createdAt - secondItem.createdAt;
    }),
    templates: [...templates].sort((firstTemplate, secondTemplate) => {
      return firstTemplate.name.localeCompare(secondTemplate.name, "en");
    }),
    settings,
    purchaseEvents: [...purchaseEvents].sort(
      (firstEvent, secondEvent) => secondEvent.boughtAt - firstEvent.boughtAt,
    ),
    productMemory: [...productMemory].sort(
      (firstMemory, secondMemory) => secondMemory.buyCount - firstMemory.buyCount,
    ),
    shoppingListMeta: [...shoppingListMeta].sort(
      (firstMeta, secondMeta) => secondMeta.updatedAt - firstMeta.updatedAt,
    ),
    priceObservations: [...priceObservations].sort(
      (firstObservation, secondObservation) =>
        secondObservation.observedAt - firstObservation.observedAt,
    ),
  };
};

export const clearShoppingDatabase = async (): Promise<void> => {
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
    },
  );
};

export const resetShoppingDatabase = async (): Promise<void> => {
  await clearShoppingDatabase();
  await ensureDatabaseDefaults();
};
