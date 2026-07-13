import { describe, expect, it } from "vitest";

import {
  normalizeProductName,
  normalizeShoppingUnit,
  parseShoppingInput,
} from "./parseShoppingInput";

describe("shopping input parser", () => {
  it("parses multiple separators, quantities, and unit aliases", () => {
    expect(parseShoppingInput("Milk 2 l, Bread; 500 g Apples")).toEqual([
      {
        name: "Milk",
        normalizedName: "milk",
        quantity: 2,
        unit: "l",
      },
      {
        name: "Bread",
        normalizedName: "bread",
        quantity: 1,
        unit: "pcs",
      },
      {
        name: "Apples",
        normalizedName: "apples",
        quantity: 500,
        unit: "g",
      },
    ]);
  });

  it("preserves decimal commas inside quantities", () => {
    expect(parseShoppingInput("Молоко 1,5 л")).toEqual([
      {
        name: "Молоко",
        normalizedName: "молоко",
        quantity: 1.5,
        unit: "l",
      },
    ]);
  });

  it("segments a space-only sequence when every product is known", () => {
    expect(parseShoppingInput("milk bread eggs", ["milk", "bread", "eggs"]))
      .toHaveLength(3);
  });

  it("normalizes product names and rejects unsupported units", () => {
    expect(normalizeProductName("  Ёжик!!!  Apples ")).toBe("ежик apples");
    expect(normalizeShoppingUnit("КГ.")).toBe("kg");
    expect(normalizeShoppingUnit("bucket")).toBeNull();
  });
});
