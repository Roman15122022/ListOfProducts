import type { ShoppingUnit } from "../domain/types";

export type PriceUnitDimension = "mass" | "volume" | "count" | "package";

export interface NormalizedQuantity {
  amount: number;
  dimension: PriceUnitDimension;
  unit: ShoppingUnit;
}

interface UnitDefinition {
  dimension: PriceUnitDimension;
  baseUnit: ShoppingUnit;
  multiplier: number;
}

const unitDefinitions: Record<ShoppingUnit, UnitDefinition> = {
  kg: { dimension: "mass", baseUnit: "g", multiplier: 1000 },
  g: { dimension: "mass", baseUnit: "g", multiplier: 1 },
  l: { dimension: "volume", baseUnit: "ml", multiplier: 1000 },
  ml: { dimension: "volume", baseUnit: "ml", multiplier: 1 },
  pcs: { dimension: "count", baseUnit: "pcs", multiplier: 1 },
  pack: { dimension: "package", baseUnit: "pack", multiplier: 1 },
};

const isPositiveFiniteNumber = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

export const normalizePriceQuantity = (
  quantity: number,
  unit: ShoppingUnit,
): NormalizedQuantity | null => {
  if (!isPositiveFiniteNumber(quantity)) {
    return null;
  }

  const definition = unitDefinitions[unit];

  return {
    amount: quantity * definition.multiplier,
    dimension: definition.dimension,
    unit: definition.baseUnit,
  };
};

export const arePriceUnitsCompatible = (
  firstUnit: ShoppingUnit,
  secondUnit: ShoppingUnit,
): boolean => unitDefinitions[firstUnit].dimension === unitDefinitions[secondUnit].dimension;

export const convertPriceQuantity = (
  quantity: number,
  sourceUnit: ShoppingUnit,
  targetUnit: ShoppingUnit,
): number | null => {
  if (!arePriceUnitsCompatible(sourceUnit, targetUnit)) {
    return null;
  }

  const normalizedQuantity = normalizePriceQuantity(quantity, sourceUnit);
  if (!normalizedQuantity) {
    return null;
  }

  return normalizedQuantity.amount / unitDefinitions[targetUnit].multiplier;
};

export const scalePriceAmountMinor = (
  amountMinor: number,
  sourceQuantity: number,
  sourceUnit: ShoppingUnit,
  targetQuantity: number,
  targetUnit: ShoppingUnit,
): number | null => {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    return null;
  }

  const normalizedSource = normalizePriceQuantity(sourceQuantity, sourceUnit);
  const normalizedTarget = normalizePriceQuantity(targetQuantity, targetUnit);

  if (
    !normalizedSource ||
    !normalizedTarget ||
    normalizedSource.dimension !== normalizedTarget.dimension
  ) {
    return null;
  }

  return Math.round(amountMinor * (normalizedTarget.amount / normalizedSource.amount));
};
