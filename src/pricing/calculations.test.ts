import { describe, expect, it } from "vitest";

import type {
  PriceObservation,
  PurchaseEvent,
  ShoppingItem,
  ShoppingListMeta,
} from "../domain/types";
import {
  getActualListTotal,
  getBudgetSummary,
  getProductPriceStats,
  groupPriceObservationsByProduct,
} from "./calculations";

const createObservation = (
  id: string,
  itemId: string,
  amountMinor: number,
  observedAt: number,
): PriceObservation => ({
  id,
  shoppingListId: "list-1",
  countryCode: "UA",
  itemId,
  itemName: itemId,
  normalizedName: itemId,
  amountMinor,
  currency: "UAH",
  packageQuantity: 1,
  packageUnit: "pcs",
  source: "manual",
  observedAt,
});

const createItem = (id: string, quantity: number): ShoppingItem => ({
  id,
  shoppingListId: "list-1",
  name: id,
  normalizedName: id,
  quantity,
  unit: "pcs",
  categoryId: "other",
  necessity: "required",
  isBought: false,
  createdAt: 1,
  updatedAt: 1,
});

describe("price calculations", () => {
  it("groups observations once by normalized product name", () => {
    const observations = [
      createObservation("first", "apples", 100, 1),
      createObservation("second", "apples", 120, 2),
      createObservation("third", "bread", 80, 3),
    ];

    const groupedObservations = groupPriceObservationsByProduct(observations);

    expect(groupedObservations.get("apples")).toHaveLength(2);
    expect(groupedObservations.get("bread")).toHaveLength(1);
  });

  it("uses only compatible manual history for product statistics", () => {
    const observations = [
      createObservation("older", "apples", 100, 1),
      createObservation("latest", "apples", 200, 2),
      { ...createObservation("other-country", "apples", 900, 3), countryCode: "PL" },
    ];

    expect(
      getProductPriceStats(
        { normalizedName: "apples", quantity: 1, unit: "pcs" },
        observations,
        "UAH",
        "UA",
      ),
    ).toMatchObject({
      lastAmountMinor: 200,
      averageAmountMinor: 150,
      lowUnitAmountMinor: 100,
      highUnitAmountMinor: 200,
      count: 2,
    });
  });

  it("prefers an actual list price and estimates remaining items from history", () => {
    const apples = createItem("apples", 2);
    const bread = createItem("bread", 3);
    const meta: ShoppingListMeta = {
      shoppingListId: "list-1",
      budgetAmountMinor: 2_000,
      currency: "UAH",
      countryCode: "UA",
      createdAt: 1,
      updatedAt: 1,
    };
    const observations = [
      {
        ...createObservation("actual-apples", "apples", 1_000, 3),
        packageQuantity: 2,
      },
      {
        ...createObservation("bread-history", "bread", 300, 2),
        shoppingListId: "older-list",
      },
    ];

    const summary = getBudgetSummary([apples, bread], observations, meta);

    expect(summary.lowAmountMinor).toBe(1_900);
    expect(summary.highAmountMinor).toBe(1_900);
    expect(summary.pricedCount).toBe(2);
    expect(summary.status).toBe("within");
    expect(summary.itemEstimates[0].isActual).toBe(true);
  });

  it("uses linked observations when calculating completed-list totals", () => {
    const event: PurchaseEvent = {
      id: "event-1",
      shoppingListId: "list-1",
      itemId: "apples",
      itemName: "Apples",
      normalizedName: "apples",
      categoryId: "fruits",
      quantity: 2,
      unit: "pcs",
      boughtAt: 10,
    };
    const observation = {
      ...createObservation("actual", "apples", 250, 11),
      purchaseEventId: event.id,
    };

    expect(getActualListTotal([event], [observation], "UAH")).toMatchObject({
      amountMinor: 500,
      pricedCount: 1,
      totalCount: 1,
      currency: "UAH",
    });
  });
});
