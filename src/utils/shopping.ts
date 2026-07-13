import { Package, type LucideIcon } from "lucide-react";

import { defaultCategories } from "../data/catalog";
import type {
  CurrencyCode,
  PurchaseEvent,
  ShoppingCategory,
  ShoppingItem,
  ShoppingUnit,
} from "../domain/types";
import { formatCurrency, getLocaleForLanguage } from "../lib/format";
import {
  getLocalizedCategoryName,
  type DisplayLanguage,
} from "../lib/localization";

export const runAsyncAction = (action: Promise<unknown>): void => {
  void action.catch(() => undefined);
};

export const getCurrentShoppingListId = (items: ShoppingItem[]): string | undefined => {
  let latestItem: ShoppingItem | undefined;
  let latestActiveItem: ShoppingItem | undefined;

  for (const item of items) {
    if (!latestItem || item.updatedAt > latestItem.updatedAt) {
      latestItem = item;
    }

    if (
      !item.isBought &&
      (!latestActiveItem || item.updatedAt > latestActiveItem.updatedAt)
    ) {
      latestActiveItem = item;
    }
  }

  return (latestActiveItem ?? latestItem)?.shoppingListId;
};

export const formatMinorCurrency = (
  amountMinor: number,
  currency: CurrencyCode,
  language: DisplayLanguage,
): string => formatCurrency(amountMinor / 100, currency, language);

export const formatMinorRange = (
  lowAmountMinor: number,
  highAmountMinor: number,
  currency: CurrencyCode,
  language: DisplayLanguage,
): string => {
  if (lowAmountMinor === highAmountMinor) {
    return formatMinorCurrency(lowAmountMinor, currency, language);
  }

  return `${formatMinorCurrency(lowAmountMinor, currency, language)}–${formatMinorCurrency(
    highAmountMinor,
    currency,
    language,
  )}`;
};

export const parseAmountMinor = (value: string): number | null => {
  const amount = Number(value.replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
};

export const getQuantityStep = (unit: ShoppingUnit): number => {
  if (unit === "kg" || unit === "l") {
    return 0.5;
  }

  if (unit === "g" || unit === "ml") {
    return 100;
  }

  return 1;
};

export const getPriceReferenceUnit = (unit: ShoppingUnit): ShoppingUnit => {
  if (unit === "g") {
    return "kg";
  }

  if (unit === "ml") {
    return "l";
  }

  return unit;
};

export const getCategory = (
  categoryId: string,
  language: DisplayLanguage,
  categories: readonly ShoppingCategory[] = defaultCategories,
): ShoppingCategory => {
  const category = categories.find((candidate) => candidate.id === categoryId);

  if (category) {
    return {
      ...category,
      name: getLocalizedCategoryName(category.id, category.name, language),
    };
  }

  const fallbackCategory = defaultCategories[defaultCategories.length - 1];

  return {
    ...fallbackCategory,
    id: categoryId || fallbackCategory.id,
    name: getLocalizedCategoryName(
      categoryId,
      categoryId || fallbackCategory.name,
      language,
    ),
  };
};

export const groupItems = (
  items: ShoppingItem[],
  isGrouped: boolean,
  language: DisplayLanguage,
  categories: readonly ShoppingCategory[] = defaultCategories,
): Array<{ category: ShoppingCategory; items: ShoppingItem[] }> => {
  if (!isGrouped) {
    return [
      {
        category: {
          id: "all",
          name: getLocalizedCategoryName("all", "All items", language),
          sortOrder: 0,
          isDefault: true,
        },
        items,
      },
    ];
  }

  const itemsByCategory = new Map<string, ShoppingItem[]>();

  for (const item of items) {
    const categoryItems = itemsByCategory.get(item.categoryId) ?? [];
    categoryItems.push(item);
    itemsByCategory.set(item.categoryId, categoryItems);
  }

  return [...itemsByCategory.entries()]
    .map(([categoryId, categoryItems]) => ({
      category: getCategory(categoryId, language, categories),
      items: categoryItems.sort((firstItem, secondItem) => {
        if (firstItem.isBought !== secondItem.isBought) {
          return Number(firstItem.isBought) - Number(secondItem.isBought);
        }

        return secondItem.createdAt - firstItem.createdAt;
      }),
    }))
    .sort(
      (firstGroup, secondGroup) =>
        firstGroup.category.sortOrder - secondGroup.category.sortOrder,
    );
};

export const getFrequentProducts = (events: PurchaseEvent[]): string[] => {
  const countByName = new Map<string, { name: string; count: number }>();

  for (const event of events) {
    const knownProduct = countByName.get(event.normalizedName);
    countByName.set(event.normalizedName, {
      name: event.itemName,
      count: (knownProduct?.count ?? 0) + 1,
    });
  }

  return [...countByName.values()]
    .sort((firstItem, secondItem) => secondItem.count - firstItem.count)
    .slice(0, 5)
    .map((item) => item.name);
};

export const getHistoryGroups = (
  events: PurchaseEvent[],
  language: DisplayLanguage,
): Array<{
  dateKey: string;
  label: string;
  completedAt: number;
  lists: Array<{
    shoppingListId: string;
    completedAt: number;
    events: PurchaseEvent[];
  }>;
}> => {
  const formatDate = new Intl.DateTimeFormat(getLocaleForLanguage(language), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const eventsByListId = new Map<string, PurchaseEvent[]>();

  for (const event of events) {
    const listEvents = eventsByListId.get(event.shoppingListId) ?? [];
    listEvents.push(event);
    eventsByListId.set(event.shoppingListId, listEvents);
  }

  const groupedDays = new Map<
    string,
    {
      label: string;
      completedAt: number;
      lists: Array<{
        shoppingListId: string;
        completedAt: number;
        events: PurchaseEvent[];
      }>;
    }
  >();

  for (const [shoppingListId, listEvents] of eventsByListId) {
    const sortedEvents = [...listEvents].sort(
      (firstEvent, secondEvent) => firstEvent.boughtAt - secondEvent.boughtAt,
    );
    const completedAt = Math.max(...sortedEvents.map((event) => event.boughtAt));
    const purchaseDate = new Date(completedAt);
    const dateKey = [
      purchaseDate.getFullYear(),
      String(purchaseDate.getMonth() + 1).padStart(2, "0"),
      String(purchaseDate.getDate()).padStart(2, "0"),
    ].join("-");
    const groupedDay = groupedDays.get(dateKey) ?? {
      label: formatDate.format(completedAt),
      completedAt,
      lists: [],
    };

    groupedDay.lists.push({
      shoppingListId,
      completedAt,
      events: sortedEvents,
    });
    groupedDay.completedAt = Math.max(groupedDay.completedAt, completedAt);
    groupedDays.set(dateKey, groupedDay);
  }

  return [...groupedDays.entries()]
    .map(([dateKey, groupedDay]) => ({
      dateKey,
      label: groupedDay.label,
      completedAt: groupedDay.completedAt,
      lists: [...groupedDay.lists]
        .sort((firstList, secondList) => secondList.completedAt - firstList.completedAt),
    }))
    .sort((firstDay, secondDay) => secondDay.completedAt - firstDay.completedAt);
};

export const getTemplateIcon = (templateId: string, icons: Record<string, LucideIcon>): LucideIcon =>
  icons[templateId] ?? Package;
