export const shoppingUnits = ["pcs", "kg", "g", "l", "ml", "pack"] as const;

export type ShoppingUnit = (typeof shoppingUnits)[number];

export type ThemePreference = "system" | "light" | "dark";
export type AppLanguage = "ru" | "uk" | "en";
export type CurrencyCode = "UAH" | "USD" | "EUR" | "PLN";
export type ItemNecessity = "required" | "optional";
export type PriceObservationSource = "manual" | "provider";

export const recipeDietLabels = [
  "balanced",
  "high-fiber",
  "high-protein",
  "low-carb",
  "low-fat",
  "low-sodium",
] as const;

export type RecipeDietLabel = (typeof recipeDietLabels)[number];

export const recipeHealthLabels = [
  "vegan",
  "vegetarian",
  "gluten-free",
  "dairy-free",
  "egg-free",
  "peanut-free",
  "tree-nut-free",
  "soy-free",
  "fish-free",
  "shellfish-free",
  "sesame-free",
] as const;

export type RecipeHealthLabel = (typeof recipeHealthLabels)[number];

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

export interface PantryItem {
  id: string;
  name: string;
  normalizedName: string;
  canonicalName: string;
  categoryId: string;
  createdAt: number;
  updatedAt: number;
  lastPurchasedAt?: number;
}

export interface PantryItemInput {
  name: string;
  categoryId?: string;
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
  recipeDiet: RecipeDietLabel | null;
  recipeHealthLabels: RecipeHealthLabel[];
  currency: CurrencyCode;
  updatedAt: number;
}

export interface ProductDictionaryEntry {
  name: string;
  categoryId: string;
}

export interface ShoppingBackup {
  version: 4;
  exportedAt: number;
  categories: ShoppingCategory[];
  items: ShoppingItem[];
  shoppingListMeta: ShoppingListMeta[];
  priceObservations: PriceObservation[];
  productMemory: ProductMemory[];
  pantryItems: PantryItem[];
  templates: ShoppingTemplate[];
  settings: ShoppingSettings[];
  purchaseEvents: PurchaseEvent[];
}
