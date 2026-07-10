import type { LucideIcon } from "lucide-react";

import type { ShoppingItem, ShoppingSettings } from "../domain/types";
import type { AppCopy, DisplayLanguage } from "../lib/localization";

export type ScreenId = "list" | "suggestions" | "templates" | "history" | "settings";

export type ShoppingSettingsUpdate = Partial<
  Omit<ShoppingSettings, "id" | "updatedAt">
>;

export type LocalizationContextValue = {
  copy: AppCopy;
  language: DisplayLanguage;
};

export type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => Promise<void>;
};

export type PriceEntryTarget = Pick<
  ShoppingItem,
  "id" | "shoppingListId" | "name" | "normalizedName" | "quantity" | "unit"
> & {
  purchaseEventId?: string;
};

export type NavigationItem = {
  id: ScreenId;
  icon: LucideIcon;
  path: string;
};

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
