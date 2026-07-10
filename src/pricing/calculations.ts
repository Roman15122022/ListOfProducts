import type {
  CurrencyCode,
  PriceObservation,
  PurchaseEvent,
  ShoppingItem,
  ShoppingListMeta,
  ShoppingUnit,
} from "../domain/types";
import { arePriceUnitsCompatible, scalePriceAmountMinor } from "./units";

const PRICE_HISTORY_LIMIT = 10;

export interface ProductPriceStats {
  lastAmountMinor: number;
  averageAmountMinor: number;
  changePercent?: number;
  lowUnitAmountMinor: number;
  highUnitAmountMinor: number;
  referenceQuantity: number;
  referenceUnit: ShoppingUnit;
  count: number;
  lastObservedAt: number;
}

export type BudgetStatus = "within" | "risk" | "over" | "partial" | "unavailable";

export interface BudgetItemEstimate {
  itemId: string;
  lowAmountMinor?: number;
  highAmountMinor?: number;
  observationCount: number;
  isActual: boolean;
}

export interface BudgetSummary {
  lowAmountMinor: number;
  highAmountMinor: number;
  pricedCount: number;
  totalCount: number;
  status: BudgetStatus;
  budgetAmountMinor?: number;
  currency: CurrencyCode;
  itemEstimates: BudgetItemEstimate[];
  optionalItemIds: string[];
}

export interface ActualListTotal {
  amountMinor: number;
  pricedCount: number;
  totalCount: number;
  currency?: CurrencyCode;
}

export interface ActualListTotalGroup extends ActualListTotal {
  shoppingListId: string;
  completedAt?: number;
}

interface PriceTarget {
  normalizedName: string;
  quantity: number;
  unit: ShoppingUnit;
}

const normalizeProductName = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLocaleLowerCase();

const getManualObservations = (
  target: PriceTarget,
  observations: readonly PriceObservation[],
  currency: CurrencyCode,
  countryCode?: string,
): PriceObservation[] =>
  observations
    .filter(
      (observation) =>
        observation.source === "manual" &&
        observation.currency === currency &&
        (countryCode === undefined || observation.countryCode === countryCode) &&
        observation.amountMinor >= 0 &&
        observation.packageQuantity > 0 &&
        normalizeProductName(observation.normalizedName) ===
          normalizeProductName(target.normalizedName) &&
        arePriceUnitsCompatible(observation.packageUnit, target.unit),
    )
    .sort((firstObservation, secondObservation) =>
      secondObservation.observedAt === firstObservation.observedAt
        ? secondObservation.id.localeCompare(firstObservation.id)
        : secondObservation.observedAt - firstObservation.observedAt,
    )
    .slice(0, PRICE_HISTORY_LIMIT);

const getScaledAmounts = (
  target: PriceTarget,
  observations: readonly PriceObservation[],
): Array<{ amountMinor: number; observedAt: number }> =>
  observations.flatMap((observation) => {
    const amountMinor = scalePriceAmountMinor(
      observation.amountMinor,
      observation.packageQuantity,
      observation.packageUnit,
      target.quantity,
      target.unit,
    );

    return amountMinor === null ? [] : [{ amountMinor, observedAt: observation.observedAt }];
  });

export const getProductPriceStats = (
  item: PriceTarget,
  observations: readonly PriceObservation[],
  currency: CurrencyCode,
  countryCode?: string,
): ProductPriceStats | null => {
  const matchingObservations = getManualObservations(
    item,
    observations,
    currency,
    countryCode,
  );
  const scaledAmounts = getScaledAmounts(item, matchingObservations);

  if (scaledAmounts.length === 0) {
    return null;
  }

  const amountValues = scaledAmounts.map(({ amountMinor }) => amountMinor);
  const lastAmountMinor = scaledAmounts[0].amountMinor;
  const averageAmountMinor = Math.round(
    amountValues.reduce((total, amountMinor) => total + amountMinor, 0) / amountValues.length,
  );
  const changePercent =
    amountValues.length > 1 && averageAmountMinor > 0
      ? Math.round(((lastAmountMinor - averageAmountMinor) / averageAmountMinor) * 1000) / 10
      : undefined;

  return {
    lastAmountMinor,
    averageAmountMinor,
    changePercent,
    lowUnitAmountMinor: Math.min(...amountValues),
    highUnitAmountMinor: Math.max(...amountValues),
    referenceQuantity: item.quantity,
    referenceUnit: item.unit,
    count: amountValues.length,
    lastObservedAt: scaledAmounts[0].observedAt,
  };
};

const getActualObservation = (
  item: ShoppingItem,
  observations: readonly PriceObservation[],
  currency: CurrencyCode,
): PriceObservation | undefined =>
  observations
    .filter(
      (observation) =>
        observation.source === "manual" &&
        observation.currency === currency &&
        observation.shoppingListId === item.shoppingListId &&
        observation.itemId === item.id,
    )
    .sort((firstObservation, secondObservation) =>
      secondObservation.observedAt - firstObservation.observedAt,
    )[0];

const getBudgetStatus = (
  lowAmountMinor: number,
  highAmountMinor: number,
  pricedCount: number,
  totalCount: number,
  budgetAmountMinor?: number,
): BudgetStatus => {
  if (budgetAmountMinor === undefined || pricedCount === 0 || totalCount === 0) {
    return "unavailable";
  }

  if (lowAmountMinor > budgetAmountMinor) {
    return "over";
  }

  if (highAmountMinor > budgetAmountMinor) {
    return "risk";
  }

  if (pricedCount < totalCount) {
    return "partial";
  }

  return "within";
};

export const getBudgetSummary = (
  items: readonly ShoppingItem[],
  observations: readonly PriceObservation[],
  meta: ShoppingListMeta,
): BudgetSummary => {
  const shoppingListItems = items.filter(
    (item) => item.shoppingListId === meta.shoppingListId,
  );
  const itemEstimates = shoppingListItems.map<BudgetItemEstimate>((item) => {
    const actualObservation = getActualObservation(item, observations, meta.currency);
    const actualAmountMinor = actualObservation
      ? scalePriceAmountMinor(
          actualObservation.amountMinor,
          actualObservation.packageQuantity,
          actualObservation.packageUnit,
          item.quantity,
          item.unit,
        )
      : null;

    if (actualAmountMinor !== null) {
      return {
        itemId: item.id,
        lowAmountMinor: actualAmountMinor,
        highAmountMinor: actualAmountMinor,
        observationCount: 1,
        isActual: true,
      };
    }

    const stats = getProductPriceStats(
      item,
      observations,
      meta.currency,
      meta.countryCode,
    );

    return {
      itemId: item.id,
      lowAmountMinor: stats?.lowUnitAmountMinor,
      highAmountMinor: stats?.highUnitAmountMinor,
      observationCount: stats?.count ?? 0,
      isActual: false,
    };
  });
  const pricedEstimates = itemEstimates.filter(
    (estimate) =>
      estimate.lowAmountMinor !== undefined && estimate.highAmountMinor !== undefined,
  );
  const lowAmountMinor = pricedEstimates.reduce(
    (total, estimate) => total + (estimate.lowAmountMinor ?? 0),
    0,
  );
  const highAmountMinor = pricedEstimates.reduce(
    (total, estimate) => total + (estimate.highAmountMinor ?? 0),
    0,
  );
  const pricedCount = pricedEstimates.length;

  return {
    lowAmountMinor,
    highAmountMinor,
    pricedCount,
    totalCount: shoppingListItems.length,
    status: getBudgetStatus(
      lowAmountMinor,
      highAmountMinor,
      pricedCount,
      shoppingListItems.length,
      meta.budgetAmountMinor,
    ),
    budgetAmountMinor: meta.budgetAmountMinor,
    currency: meta.currency,
    itemEstimates,
    optionalItemIds: shoppingListItems
      .filter((item) => item.necessity === "optional")
      .map((item) => item.id),
  };
};

const getLatestObservationByEvent = (
  event: PurchaseEvent,
  observations: readonly PriceObservation[],
  currency?: CurrencyCode,
): PriceObservation | undefined =>
  observations
    .filter(
      (observation) =>
        observation.source === "manual" &&
        observation.shoppingListId === event.shoppingListId &&
        (observation.purchaseEventId === event.id ||
          (!observation.purchaseEventId && observation.itemId === event.itemId)) &&
        (currency === undefined || observation.currency === currency),
    )
    .sort((firstObservation, secondObservation) =>
      secondObservation.observedAt - firstObservation.observedAt,
    )[0];

export const getActualListTotal = (
  events: readonly PurchaseEvent[],
  observations: readonly PriceObservation[] = [],
  currency?: CurrencyCode,
): ActualListTotal => {
  const sortedEvents = [...events].sort(
    (firstEvent, secondEvent) => secondEvent.boughtAt - firstEvent.boughtAt,
  );
  const inferredCurrency =
    currency ??
    sortedEvents
      .map((event) => event.actualCurrency)
      .find((eventCurrency): eventCurrency is CurrencyCode => Boolean(eventCurrency)) ??
    sortedEvents
      .map((event) => getLatestObservationByEvent(event, observations)?.currency)
      .find((observationCurrency): observationCurrency is CurrencyCode =>
        Boolean(observationCurrency),
      );
  const pricedAmounts = sortedEvents.flatMap((event) => {
    const observation = getLatestObservationByEvent(event, observations, inferredCurrency);

    if (observation) {
      const amountMinor = scalePriceAmountMinor(
        observation.amountMinor,
        observation.packageQuantity,
        observation.packageUnit,
        event.quantity,
        event.unit,
      );

      if (amountMinor !== null) {
        return [amountMinor];
      }
    }

    if (
      event.actualAmountMinor !== undefined &&
      event.actualCurrency !== undefined &&
      (inferredCurrency === undefined || event.actualCurrency === inferredCurrency)
    ) {
      return [event.actualAmountMinor];
    }

    return [];
  });

  return {
    amountMinor: pricedAmounts.reduce((total, amountMinor) => total + amountMinor, 0),
    pricedCount: pricedAmounts.length,
    totalCount: events.length,
    currency: inferredCurrency,
  };
};

export const getActualTotalsByList = (
  events: readonly PurchaseEvent[],
  observations: readonly PriceObservation[],
  currency?: CurrencyCode,
): ActualListTotalGroup[] => {
  const eventsByShoppingList = new Map<string, PurchaseEvent[]>();

  for (const event of events) {
    const currentEvents = eventsByShoppingList.get(event.shoppingListId) ?? [];
    currentEvents.push(event);
    eventsByShoppingList.set(event.shoppingListId, currentEvents);
  }

  return Array.from(eventsByShoppingList.entries())
    .map(([shoppingListId, shoppingListEvents]) => ({
      shoppingListId,
      completedAt: Math.max(...shoppingListEvents.map((event) => event.boughtAt)),
      ...getActualListTotal(shoppingListEvents, observations, currency),
    }))
    .sort((firstTotal, secondTotal) =>
      (secondTotal.completedAt ?? 0) - (firstTotal.completedAt ?? 0),
    );
};
