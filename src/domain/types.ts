export const shoppingUnits = ["pcs", "kg", "g", "l", "ml", "pack"] as const;

export type ShoppingUnit = (typeof shoppingUnits)[number];

export type ThemePreference = "system" | "light" | "dark";
export type AppLanguage = "ru" | "uk" | "en";
export type CurrencyCode = "UAH" | "USD" | "EUR" | "PLN";
export type ItemNecessity = "required" | "optional";
export type PriceObservationSource = "manual" | "provider";

export interface ShoppingCategory {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
}

export interface ShoppingItem {
  id: string;
  shoppingListId: string;
  name: string;
  normalizedName: string;
  quantity: number;
  unit: ShoppingUnit;
  categoryId: string;
  necessity: ItemNecessity;
  price?: number;
  isBought: boolean;
  createdAt: number;
  updatedAt: number;
  boughtAt?: number;
}

export interface ShoppingItemInput {
  name: string;
  quantity?: number;
  unit?: ShoppingUnit;
  categoryId?: string;
  necessity?: ItemNecessity;
  price?: number;
}

export interface ShoppingItemUpdate {
  name?: string;
  quantity?: number;
  unit?: ShoppingUnit;
  categoryId?: string;
  necessity?: ItemNecessity;
  price?: number;
}

export interface ShoppingListMeta {
  shoppingListId: string;
  budgetAmountMinor?: number;
  currency: CurrencyCode;
  countryCode: string;
  createdAt: number;
  updatedAt: number;
}

export interface PriceObservation {
  id: string;
  shoppingListId: string;
  countryCode: string;
  itemId: string;
  purchaseEventId?: string;
  itemName: string;
  normalizedName: string;
  amountMinor: number;
  currency: CurrencyCode;
  packageQuantity: number;
  packageUnit: ShoppingUnit;
  source: PriceObservationSource;
  observedAt: number;
}

export interface PriceObservationInput {
  itemId: string;
  shoppingListId: string;
  purchaseEventId?: string;
  amountMinor: number;
  currency: CurrencyCode;
  packageQuantity: number;
  packageUnit: ShoppingUnit;
  source?: PriceObservationSource;
  observedAt?: number;
}

export interface ParsedShoppingItem {
  name: string;
  normalizedName: string;
  quantity: number;
  unit: ShoppingUnit;
}

export interface TemplateItem {
  name: string;
  normalizedName: string;
  quantity: number;
  unit: ShoppingUnit;
  categoryId: string;
}

export interface ShoppingTemplate {
  id: string;
  name: string;
  items: TemplateItem[];
  createdAt: number;
  updatedAt: number;
  isStarter?: boolean;
}

export interface ShoppingTemplateInput {
  name: string;
  items: TemplateItem[];
}

export interface ProductMemory {
  id: string;
  name: string;
  normalizedName: string;
  categoryId: string;
  defaultQuantity: number;
  defaultUnit: ShoppingUnit;
  buyCount: number;
  lastBoughtAt?: number;
  averageIntervalDays?: number;
  averagePrice?: number;
  relatedItems: Record<string, number>;
}

export interface PurchaseEvent {
  id: string;
  shoppingListId: string;
  itemId: string;
  itemName: string;
  normalizedName: string;
  categoryId: string;
  quantity: number;
  unit: ShoppingUnit;
  price?: number;
  priceObservationId?: string;
  actualAmountMinor?: number;
  actualCurrency?: CurrencyCode;
  boughtAt: number;
}

export interface ShoppingSettings {
  id: "app-settings";
  theme: ThemePreference;
  language: AppLanguage;
  hideBoughtItems: boolean;
  groupByCategory: boolean;
  enableAiSuggestions: boolean;
  enableLocalMlTraining: boolean;
  currency: CurrencyCode;
  updatedAt: number;
}

export interface ProductDictionaryEntry {
  name: string;
  categoryId: string;
}

export interface ShoppingBackup {
  version: 3;
  exportedAt: number;
  categories: ShoppingCategory[];
  items: ShoppingItem[];
  shoppingListMeta: ShoppingListMeta[];
  priceObservations: PriceObservation[];
  productMemory: ProductMemory[];
  templates: ShoppingTemplate[];
  settings: ShoppingSettings[];
  purchaseEvents: PurchaseEvent[];
}
