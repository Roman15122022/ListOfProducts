import type { AppLanguage, CurrencyCode, ShoppingItem, ShoppingUnit } from "../domain/types";
import { normalizeShoppingUnit } from "./parseShoppingInput";

type DisplayLanguage = Extract<AppLanguage, "en" | "uk">;

const displayLanguageLocales: Record<DisplayLanguage, string> = {
  en: "en-US",
  uk: "uk-UA",
};

const unitLabels: Record<DisplayLanguage, Record<ShoppingUnit, string>> = {
  en: {
    pcs: "pcs",
    kg: "kg",
    g: "g",
    l: "L",
    ml: "mL",
    pack: "pack",
  },
  uk: {
    pcs: "шт.",
    kg: "кг",
    g: "г",
    l: "л",
    ml: "мл",
    pack: "уп.",
  },
};

const shoppingListTitles: Record<DisplayLanguage, string> = {
  en: "Shopping list",
  uk: "Список покупок",
};

export const resolveDisplayLanguage = (language?: AppLanguage): DisplayLanguage =>
  language === "uk" ? "uk" : "en";

export const getLocaleForLanguage = (language?: AppLanguage): string =>
  displayLanguageLocales[resolveDisplayLanguage(language)];

export const getUnitLabel = (unit: ShoppingUnit, language?: AppLanguage): string => {
  const displayLanguage = resolveDisplayLanguage(language);
  const normalizedUnit = normalizeShoppingUnit(unit) ?? "pcs";

  return unitLabels[displayLanguage][normalizedUnit];
};

const fallbackRandomPart = (length: number): string =>
  Math.floor(Math.random() * 16 ** length)
    .toString(16)
    .padStart(length, "0");

export const createUuid = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return [
    fallbackRandomPart(8),
    fallbackRandomPart(4),
    `4${fallbackRandomPart(3)}`,
    `${8 + Math.floor(Math.random() * 4)}${fallbackRandomPart(3)}`,
    fallbackRandomPart(12),
  ].join("-");
};

export const formatQuantity = (
  quantity: number,
  unit: ShoppingUnit,
  language?: AppLanguage,
): string => {
  const formattedQuantity = new Intl.NumberFormat(getLocaleForLanguage(language), {
    maximumFractionDigits: 2,
  }).format(quantity);

  return `${formattedQuantity} ${getUnitLabel(unit, language)}`;
};

export const formatShoppingItem = (
  item: Pick<ShoppingItem, "name" | "quantity" | "unit">,
  language?: AppLanguage,
): string => `${item.name} ${formatQuantity(item.quantity, item.unit, language)}`;

export const formatShoppingList = (
  items: Array<Pick<ShoppingItem, "name" | "quantity" | "unit">>,
  title?: string,
  language?: AppLanguage,
): string => {
  const displayLanguage = resolveDisplayLanguage(language);
  const listTitle = title ?? shoppingListTitles[displayLanguage];

  return [listTitle + ":", ...items.map((item) => `- ${formatShoppingItem(item, language)}`)].join("\n");
};

export const formatCurrency = (
  value: number,
  currency: CurrencyCode,
  language?: AppLanguage,
): string =>
  new Intl.NumberFormat(getLocaleForLanguage(language), { style: "currency", currency }).format(value);

export const formatDateTime = (timestamp: number, language?: AppLanguage): string =>
  new Intl.DateTimeFormat(getLocaleForLanguage(language), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);

export const formatTime = (timestamp: number, language?: AppLanguage): string =>
  new Intl.DateTimeFormat(getLocaleForLanguage(language), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);

export const capitalizeProductName = (value: string): string => {
  const normalizedValue = value.trim().replace(/\s+/g, " ");

  if (!normalizedValue) {
    return normalizedValue;
  }

  return `${normalizedValue[0].toLocaleUpperCase()}${normalizedValue.slice(1)}`;
};
