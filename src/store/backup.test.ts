import { describe, expect, it } from "vitest";

import type { ShoppingBackup } from "../domain/types";
import { parseShoppingBackup } from "./useShoppingStore";

const createBackup = (): ShoppingBackup => ({
  version: 4,
  exportedAt: 1_000,
  categories: [],
  items: [
    {
      id: "item-1",
      shoppingListId: "list-1",
      name: "Apples",
      normalizedName: "apples",
      quantity: 2,
      unit: "pcs",
      categoryId: "fruits",
      necessity: "required",
      isBought: false,
      createdAt: 100,
      updatedAt: 200,
    },
  ],
  shoppingListMeta: [
    {
      shoppingListId: "list-1",
      currency: "UAH",
      countryCode: "UA",
      createdAt: 100,
      updatedAt: 200,
    },
  ],
  priceObservations: [],
  productMemory: [],
  pantryItems: [],
  templates: [],
  settings: [
    {
      id: "app-settings",
      theme: "system",
      language: "en",
      hideBoughtItems: false,
      groupByCategory: true,
      enableAiSuggestions: true,
      enableLocalMlTraining: false,
      recipeDiet: null,
      recipeHealthLabels: [],
      currency: "UAH",
      updatedAt: 200,
    },
  ],
  purchaseEvents: [],
});

describe("shopping backup validation and migrations", () => {
  it("accepts a valid current backup", () => {
    const parsedBackup = parseShoppingBackup(createBackup());

    expect(parsedBackup.version).toBe(4);
    expect(parsedBackup.items).toHaveLength(1);
    expect(parsedBackup.items[0].shoppingListId).toBe("list-1");
  });

  it("normalizes old hidden items into the current list", () => {
    const currentBackup = createBackup();
    const legacyBackup = {
      ...currentBackup,
      version: 2,
      items: [
        {
          ...currentBackup.items[0],
          id: "old-bought-item",
          shoppingListId: "old-list",
          isBought: true,
          boughtAt: 150,
          updatedAt: 150,
        },
        {
          ...currentBackup.items[0],
          id: "current-item",
          shoppingListId: "current-list",
          updatedAt: 300,
        },
      ],
      purchaseEvents: [
        {
          id: "event-1",
          shoppingListId: "old-list",
          itemId: "old-bought-item",
          itemName: "Apples",
          normalizedName: "apples",
          categoryId: "fruits",
          quantity: 2,
          unit: "pcs",
          boughtAt: 150,
        },
      ],
      shoppingListMeta: undefined,
      priceObservations: undefined,
      pantryItems: undefined,
    };

    const parsedBackup = parseShoppingBackup(legacyBackup);

    expect(new Set(parsedBackup.items.map((item) => item.shoppingListId))).toEqual(
      new Set(["current-list"]),
    );
    expect(parsedBackup.purchaseEvents[0].shoppingListId).toBe("old-list");
  });

  it("migrates a version 1 backup without list ids or necessity", () => {
    const currentBackup = createBackup();
    const legacyItem = Object.fromEntries(
      Object.entries(currentBackup.items[0]).filter(
        ([propertyName]) =>
          propertyName !== "shoppingListId" && propertyName !== "necessity",
      ),
    );
    const legacyBackup = {
      ...currentBackup,
      version: 1,
      items: [legacyItem],
      shoppingListMeta: undefined,
      priceObservations: undefined,
      pantryItems: undefined,
    };

    const parsedBackup = parseShoppingBackup(legacyBackup);

    expect(parsedBackup.items[0].shoppingListId).toBeTruthy();
    expect(parsedBackup.items[0].necessity).toBe("required");
  });

  it("keeps historical prices importable when items move to the current list", () => {
    const backup = createBackup();
    backup.items = [
      {
        ...backup.items[0],
        id: "bought-item",
        shoppingListId: "old-list",
        isBought: true,
        boughtAt: 150,
        updatedAt: 150,
      },
      {
        ...backup.items[0],
        id: "current-item",
        shoppingListId: "current-list",
        updatedAt: 300,
      },
    ];
    backup.shoppingListMeta = [
      {
        shoppingListId: "old-list",
        currency: "UAH",
        countryCode: "UA",
        createdAt: 100,
        updatedAt: 150,
      },
      {
        shoppingListId: "current-list",
        currency: "UAH",
        countryCode: "UA",
        createdAt: 200,
        updatedAt: 300,
      },
    ];
    backup.purchaseEvents = [
      {
        id: "event-1",
        shoppingListId: "old-list",
        itemId: "bought-item",
        itemName: "Apples",
        normalizedName: "apples",
        categoryId: "fruits",
        quantity: 2,
        unit: "pcs",
        priceObservationId: "observation-1",
        boughtAt: 150,
      },
    ];
    backup.priceObservations = [
      {
        id: "observation-1",
        shoppingListId: "old-list",
        countryCode: "UA",
        itemId: "bought-item",
        purchaseEventId: "event-1",
        itemName: "Apples",
        normalizedName: "apples",
        amountMinor: 12_345,
        currency: "UAH",
        packageQuantity: 2,
        packageUnit: "pcs",
        source: "manual",
        observedAt: 150,
      },
    ];

    const parsedBackup = parseShoppingBackup(backup);

    expect(new Set(parsedBackup.items.map((item) => item.shoppingListId))).toEqual(
      new Set(["current-list"]),
    );
    expect(parsedBackup.purchaseEvents[0].shoppingListId).toBe("old-list");
    expect(parsedBackup.priceObservations[0].shoppingListId).toBe("old-list");
    expect(() => parseShoppingBackup(parsedBackup)).not.toThrow();
  });

  it("rejects duplicate ids and invalid numeric values", () => {
    const duplicateItem = { ...createBackup().items[0] };
    const duplicateBackup = createBackup();
    duplicateBackup.items.push(duplicateItem);

    expect(() => parseShoppingBackup(duplicateBackup)).toThrow(/duplicate/u);

    const invalidQuantityBackup = createBackup();
    invalidQuantityBackup.items[0].quantity = 0;

    expect(() => parseShoppingBackup(invalidQuantityBackup)).toThrow(/unsupported/u);
  });

  it("rejects dangling category references", () => {
    const backup = createBackup();
    backup.items[0].categoryId = "missing-category";

    expect(() => parseShoppingBackup(backup)).toThrow(/category/u);
  });
});
