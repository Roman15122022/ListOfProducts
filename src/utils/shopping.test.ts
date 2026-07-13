import { describe, expect, it } from "vitest";

import type { ShoppingCategory, ShoppingItem } from "../domain/types";
import {
  getCategory,
  getCurrentShoppingListId,
  groupItems,
  parseAmountMinor,
} from "./shopping";

const customCategory: ShoppingCategory = {
  id: "farmers-market",
  name: "Farmers market",
  sortOrder: 2,
  isDefault: false,
};

const createItem = (
  id: string,
  shoppingListId: string,
  categoryId: string,
  updatedAt: number,
  isBought = false,
): ShoppingItem => ({
  id,
  shoppingListId,
  name: id,
  normalizedName: id,
  quantity: 1,
  unit: "pcs",
  categoryId,
  necessity: "required",
  isBought,
  createdAt: updatedAt,
  updatedAt,
});

describe("shopping helpers", () => {
  it("preserves custom category ids, names, and React-safe group keys", () => {
    const items = [
      createItem("first", "list-1", customCategory.id, 1),
      createItem("second", "list-1", "second-custom", 2),
    ];
    const categories = [
      customCategory,
      {
        id: "second-custom",
        name: "Second custom",
        sortOrder: 3,
        isDefault: false,
      },
    ];

    const groups = groupItems(items, true, "en", categories);

    expect(groups.map((group) => group.category.id)).toEqual([
      "farmers-market",
      "second-custom",
    ]);
    expect(groups.map((group) => group.category.name)).toEqual([
      "Farmers market",
      "Second custom",
    ]);
  });

  it("keeps an unknown category identity instead of collapsing it into other", () => {
    expect(getCategory("legacy-category", "en", [])).toMatchObject({
      id: "legacy-category",
      name: "legacy-category",
    });
  });

  it("chooses the newest active list before a newer purchased item", () => {
    const items = [
      createItem("active", "active-list", "other", 10),
      createItem("purchased", "old-list", "other", 20, true),
    ];

    expect(getCurrentShoppingListId(items)).toBe("active-list");
  });

  it("parses positive currency amounts into integer minor units", () => {
    expect(parseAmountMinor("12,34")).toBe(1234);
    expect(parseAmountMinor("0")).toBeNull();
    expect(parseAmountMinor("not-a-price")).toBeNull();
  });
});
