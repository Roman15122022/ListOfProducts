import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  Apple,
  ArchiveRestore,
  AlertTriangle,
  ArrowLeft,
  Beef,
  BellRing,
  Carrot,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Coffee,
  Cookie,
  Egg,
  FileDown,
  FileUp,
  Fish,
  History,
  Heart,
  LayoutTemplate,
  ListChecks,
  Milk,
  Minus,
  Monitor,
  Moon,
  Package,
  PanelTopOpen,
  Plus,
  Pencil,
  RefreshCw,
  Settings,
  ShoppingBasket,
  Sparkles,
  Snowflake,
  SprayCan,
  Sun,
  Tag,
  Trash2,
  Utensils,
  WifiOff,
  Wallet,
  Wheat,
  type LucideIcon,
} from "lucide-react";

import { defaultCategories } from "../data/catalog";
import type {
  CurrencyCode,
  ItemNecessity,
  PriceObservation,
  PurchaseEvent,
  ShoppingBackup,
  ShoppingCategory,
  ShoppingItem,
  ShoppingListMeta,
  ShoppingSettings,
  ShoppingTemplate,
  ShoppingUnit,
  ThemePreference,
} from "../domain/types";
import { shoppingUnits } from "../domain/types";
import {
  formatCurrency,
  formatQuantity,
  formatShoppingList,
  formatTime,
  getLocaleForLanguage,
  getUnitLabel,
} from "../lib/format";
import {
  getAppCopy,
  getLocalizedCategoryName,
  getLocalizedStarterTemplate,
  resolveDisplayLanguage,
  type AppCopy,
  type DisplayLanguage,
} from "../lib/localization";
import {
  arePriceUnitsCompatible,
  getActualListTotal,
  getBudgetSummary,
  getProductPriceStats,
  type BudgetStatus,
  type BudgetSummary,
  type ProductPriceStats,
} from "../pricing";
import { useShoppingStore } from "../store/useShoppingStore";

type ScreenId = "list" | "suggestions" | "templates" | "history" | "settings";
type ShoppingSettingsUpdate = Partial<Omit<ShoppingSettings, "id" | "updatedAt">>;
type LocalizationContextValue = { copy: AppCopy; language: DisplayLanguage };
type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => Promise<void>;
};
type PriceEntryTarget = Pick<
  ShoppingItem,
  "id" | "shoppingListId" | "name" | "normalizedName" | "quantity" | "unit"
> & {
  purchaseEventId?: string;
};

type NavigationItem = {
  id: ScreenId;
  icon: LucideIcon;
  path: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const navigationItems: NavigationItem[] = [
  { id: "list", icon: ListChecks, path: "/" },
  { id: "suggestions", icon: Sparkles, path: "/suggestions" },
  { id: "templates", icon: LayoutTemplate, path: "/templates" },
  { id: "history", icon: History, path: "/history" },
  { id: "settings", icon: Settings, path: "/settings" },
];

const mobileNavigationOrder: ScreenId[] = [
  "suggestions",
  "templates",
  "list",
  "history",
  "settings",
];

const categoryIcons: Record<string, LucideIcon> = {
  vegetables: Carrot,
  fruits: Apple,
  dairy: Milk,
  eggs: Egg,
  meat: Beef,
  fish: Fish,
  grains: Wheat,
  pasta: Utensils,
  bread: Wheat,
  drinks: Coffee,
  sweets: Cookie,
  frozen: Snowflake,
  canned: Package,
  household: SprayCan,
  hygiene: Heart,
  other: Package,
};

const runAsyncAction = (action: Promise<unknown>): void => {
  void action.catch(() => undefined);
};

const LocalizationContext = createContext<LocalizationContextValue>({
  copy: getAppCopy("en"),
  language: "en",
});

const useLocalization = (): LocalizationContextValue => useContext(LocalizationContext);

const screenFromPath = (pathname: string): ScreenId => {
  const matchingItem = navigationItems.find((item) => item.path === pathname);
  return matchingItem?.id ?? "list";
};

const getCategory = (
  categoryId: string,
  language: DisplayLanguage,
): ShoppingCategory => {
  const category =
    defaultCategories.find((candidate) => candidate.id === categoryId) ??
    defaultCategories[defaultCategories.length - 1];

  return {
    ...category,
    name: getLocalizedCategoryName(category.id, category.name, language),
  };
};

const getCategoryIcon = (categoryId: string): LucideIcon =>
  categoryIcons[categoryId] ?? Package;

const useIsMobileViewport = (): boolean => {
  const [isMobileViewport, setMobileViewport] = useState(() =>
    window.matchMedia("(max-width: 719px)").matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 719px)");
    const updateViewport = () => setMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  return isMobileViewport;
};

const getCurrentShoppingListId = (items: ShoppingItem[]): string | undefined => {
  const activeItem = [...items]
    .filter((item) => !item.isBought)
    .sort((firstItem, secondItem) => secondItem.updatedAt - firstItem.updatedAt)[0];

  if (activeItem) {
    return activeItem.shoppingListId;
  }

  return [...items].sort(
    (firstItem, secondItem) => secondItem.updatedAt - firstItem.updatedAt,
  )[0]?.shoppingListId;
};

const formatMinorCurrency = (
  amountMinor: number,
  currency: CurrencyCode,
  language: DisplayLanguage,
): string => formatCurrency(amountMinor / 100, currency, language);

const formatMinorRange = (
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

const parseAmountMinor = (value: string): number | null => {
  const amount = Number(value.replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
};

const getQuantityStep = (unit: ShoppingUnit): number => {
  if (unit === "kg" || unit === "l") {
    return 0.5;
  }

  if (unit === "g" || unit === "ml") {
    return 100;
  }

  return 1;
};

const getPriceReferenceUnit = (unit: ShoppingUnit): ShoppingUnit => {
  if (unit === "g") {
    return "kg";
  }

  if (unit === "ml") {
    return "l";
  }

  return unit;
};

const groupItems = (
  items: ShoppingItem[],
  isGrouped: boolean,
  language: DisplayLanguage,
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
      category: getCategory(categoryId, language),
      items: categoryItems.sort((firstItem, secondItem) => {
        if (firstItem.isBought !== secondItem.isBought) {
          return Number(firstItem.isBought) - Number(secondItem.isBought);
        }

        return firstItem.createdAt - secondItem.createdAt;
      }),
    }))
    .sort(
      (firstGroup, secondGroup) =>
        firstGroup.category.sortOrder - secondGroup.category.sortOrder,
    );
};

const getFrequentProducts = (events: PurchaseEvent[]): string[] => {
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

const getHistoryGroups = (
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

const getTemplateIcon = (templateId: string): LucideIcon => {
  if (templateId === "starter-borscht") {
    return Carrot;
  }

  if (templateId === "starter-breakfast") {
    return Egg;
  }

  if (templateId === "starter-gym") {
    return Beef;
  }

  return ShoppingBasket;
};

export const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isReady,
    error,
    items,
    templates,
    settings,
    purchaseEvents,
    shoppingListMeta,
    priceObservations,
    initialize,
    addFromText,
    toggleItem,
    deleteItem,
    deleteItems,
    restoreItem,
    restoreItems,
    clearBought,
    clearItems,
    applyTemplate,
    updateSettings,
    exportData,
    importData,
    resetData,
    setItemCategory,
    setItemNecessity,
    updateItem,
    setShoppingListBudget,
    savePriceObservation,
    updateItemQuantity,
  } = useShoppingStore();
  const [isShoppingModeOpen, setShoppingModeOpen] = useState(false);
  const [showBoughtInShoppingMode, setShowBoughtInShoppingMode] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ShoppingItem | null>(null);
  const [priceTargetItem, setPriceTargetItem] = useState<PriceEntryTarget | null>(null);
  const [isBudgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [isBudgetReviewOpen, setBudgetReviewOpen] = useState(false);
  const [pendingClearList, setPendingClearList] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);
  const [isOnline, setOnline] = useState(() => navigator.onLine);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const isMobileViewport = useIsMobileViewport();

  const language = resolveDisplayLanguage(settings?.language);
  const copy = getAppCopy(language);
  const activeScreen = screenFromPath(location.pathname);
  const currentShoppingListId = getCurrentShoppingListId(items);
  const currentListMeta = currentShoppingListId
    ? shoppingListMeta.find((meta) => meta.shoppingListId === currentShoppingListId)
    : undefined;
  const currentListItems = currentShoppingListId
    ? items.filter((item) => item.shoppingListId === currentShoppingListId)
    : [];
  const currentBudgetSummary = currentListMeta
    ? getBudgetSummary(currentListItems, priceObservations, currentListMeta)
    : null;
  const selectedItemListMeta = selectedItem
    ? shoppingListMeta.find((meta) => meta.shoppingListId === selectedItem.shoppingListId)
    : undefined;
  const selectedItemCurrency = selectedItemListMeta?.currency ?? settings.currency;
  const selectedItemPriceStats = selectedItem
    ? getProductPriceStats(
        {
          normalizedName: selectedItem.normalizedName,
          quantity: 1,
          unit: getPriceReferenceUnit(selectedItem.unit),
        },
        priceObservations,
        selectedItemCurrency,
        selectedItemListMeta?.countryCode ?? "UA",
      )
    : null;

  useEffect(() => {
    runAsyncAction(initialize());
  }, [initialize]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setToast(null), toast.onAction ? 10000 : 2800);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (error && isReady) {
      setToast({ message: copy.toasts.operationFailed });
    }
  }, [copy.toasts.operationFailed, error, isReady]);

  useEffect(() => {
    const hasOpenOverlay =
      isShoppingModeOpen ||
      Boolean(selectedItem) ||
      Boolean(priceTargetItem) ||
      isBudgetDialogOpen ||
      isBudgetReviewOpen ||
      pendingClearList ||
      pendingReset;

    if (!hasOpenOverlay) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [
    isBudgetDialogOpen,
    isBudgetReviewOpen,
    isShoppingModeOpen,
    pendingClearList,
    pendingReset,
    priceTargetItem,
    selectedItem,
  ]);

  useEffect(() => {
    const themePreference = settings?.theme ?? "system";
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      const activeTheme =
        themePreference === "system"
          ? mediaQuery.matches
            ? "dark"
            : "light"
          : themePreference;
      document.documentElement.dataset.theme = activeTheme;
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        "content",
        activeTheme === "dark" ? "#10221a" : "#0f766e",
      );
    };

    updateTheme();
    mediaQuery.addEventListener("change", updateTheme);

    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, [settings?.theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = copy.app.documentTitle;
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      copy.app.documentDescription,
    );
  }, [copy, language]);

  const selectScreen = (screenId: ScreenId) => {
    const targetPath = navigationItems.find((item) => item.id === screenId)?.path ?? "/";
    navigate(targetPath);
  };

  const showToast = (
    message: string,
    action?: Pick<ToastState, "actionLabel" | "onAction">,
  ) => setToast({ message, ...action });

  const handleDeleteItem = async (itemId: string) => {
    const deletedItem = items.find((item) => item.id === itemId);
    await deleteItem(itemId);

    if (!deletedItem) {
      return;
    }

    showToast(copy.toasts.itemDeleted(deletedItem.name), {
      actionLabel: copy.common.undo,
      onAction: () => restoreItem(deletedItem),
    });
  };

  const handleToggleItem = async (itemId: string) => {
    const updatedItem = await toggleItem(itemId);

    if (!updatedItem?.isBought) {
      return;
    }

    showToast(copy.toasts.purchased(updatedItem.name), {
      actionLabel: copy.price.addPrice,
      onAction: async () => setPriceTargetItem(updatedItem),
    });
  };

  const handleSaveBudget = async (
    budgetAmountMinor: number,
    currency: CurrencyCode,
  ) => {
    if (!currentShoppingListId) {
      return;
    }

    await setShoppingListBudget(currentShoppingListId, budgetAmountMinor, currency);
    setBudgetDialogOpen(false);
    showToast(copy.toasts.budgetSaved);
  };

  const handleRemoveBudget = async () => {
    if (!currentShoppingListId) {
      return;
    }

    await setShoppingListBudget(currentShoppingListId, undefined);
    setBudgetDialogOpen(false);
    setBudgetReviewOpen(false);
    showToast(copy.toasts.budgetRemoved);
  };

  const handleSavePrice = async (
    item: PriceEntryTarget,
    amountMinor: number,
    packageQuantity: number,
    packageUnit: ShoppingUnit,
  ) => {
    const itemCurrency =
      shoppingListMeta.find((meta) => meta.shoppingListId === item.shoppingListId)?.currency ??
      settings.currency;
    const observation = await savePriceObservation({
      itemId: item.id,
      shoppingListId: item.shoppingListId,
      purchaseEventId: item.purchaseEventId,
      amountMinor,
      currency: itemCurrency,
      packageQuantity,
      packageUnit,
      source: "manual",
    });

    if (!observation) {
      return;
    }

    setPriceTargetItem(null);
    showToast(copy.toasts.priceSaved);
  };

  const handleRemoveOptionalItems = async (itemIds: string[]) => {
    const removedItems = await deleteItems(itemIds);

    if (removedItems.length === 0) {
      return;
    }

    setBudgetReviewOpen(false);
    showToast(copy.toasts.optionalRemoved(removedItems.length), {
      actionLabel: copy.common.undo,
      onAction: () => restoreItems(removedItems),
    });
  };

  const handleApplyQuantities = async (quantities: Record<string, number>) => {
    await Promise.all(
      Object.entries(quantities).map(([itemId, quantity]) =>
        updateItemQuantity(itemId, quantity),
      ),
    );
    setBudgetReviewOpen(false);
    showToast(copy.toasts.quantitiesUpdated);
  };

  const handleAddText = async (input: string) => {
    const addedItems = await addFromText(input);

    if (addedItems.length === 0) {
      return;
    }

    showToast(
      addedItems.length === 1
        ? copy.toasts.itemAdded(addedItems[0].name)
        : copy.toasts.itemsAdded(addedItems.length),
    );
  };

  const handleApplyTemplate = async (template: ShoppingTemplate) => {
    await applyTemplate(template);
    showToast(copy.toasts.templateAdded(template.name));
  };

  const handleCopyList = async () => {
    const activeItems = currentListItems.filter((item) => !item.isBought);

    if (activeItems.length === 0) {
      showToast(copy.toasts.noActiveItems);
      return;
    }

    try {
      await navigator.clipboard.writeText(formatShoppingList(activeItems, undefined, language));
      showToast(copy.toasts.listCopied);
    } catch {
      showToast(copy.toasts.copyFailed);
    }
  };

  const handleExport = async () => {
    const backup = await exportData();
    const backupContent = JSON.stringify(backup, null, 2);
    const dataBlob = new Blob([backupContent], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(dataBlob);
    const linkElement = document.createElement("a");
    linkElement.href = downloadUrl;
    linkElement.download = `smart-shopping-list-${new Date().toISOString().slice(0, 10)}.json`;
    linkElement.click();
    URL.revokeObjectURL(downloadUrl);
    showToast(copy.toasts.backupReady);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile) {
      return;
    }

    try {
      const parsedBackup = JSON.parse(await selectedFile.text()) as ShoppingBackup;
      await importData(parsedBackup);
      showToast(copy.toasts.dataRestored);
    } catch {
      showToast(copy.toasts.importFailed);
    }
  };

  const handleReset = async () => {
    await resetData();
    setPendingReset(false);
    selectScreen("list");
    showToast(copy.toasts.dataCleared);
  };

  const handleClearList = async () => {
    await clearItems();
    setPendingClearList(false);
    showToast(copy.toasts.listCleared);
  };

  const handleInstall = async () => {
    if (!installPrompt) {
      showToast(copy.toasts.installFromBrowser);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === "accepted") {
      showToast(copy.toasts.appInstalled);
    }

    setInstallPrompt(null);
  };

  if (error && !isReady) {
    return (
      <LocalizationContext.Provider value={{ copy, language }}>
        <ErrorState onRetry={() => runAsyncAction(initialize())} />
      </LocalizationContext.Provider>
    );
  }

  if (!isReady || !settings) {
    return (
      <LocalizationContext.Provider value={{ copy, language }}>
        <LoadingState />
      </LocalizationContext.Provider>
    );
  }

  return (
    <LocalizationContext.Provider value={{ copy, language }}>
      <MotionConfig reducedMotion={isMobileViewport ? "always" : "user"}>
        <main className="app-shell">
      <div className="app-frame">
        <DesktopNavigation activeScreen={activeScreen} onSelect={selectScreen} />
        <section className="app-main">
          <TopBar
            activeScreen={activeScreen}
            isOnline={isOnline}
            onOpenShoppingMode={() => setShoppingModeOpen(true)}
            onOpenSettings={() => selectScreen("settings")}
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={activeScreen}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.18 }}
            >
              {activeScreen === "list" && (
                <ShoppingListScreen
                  items={currentListItems}
                  settings={settings}
                  listMeta={currentListMeta}
                  budgetSummary={currentBudgetSummary}
                  onAddText={handleAddText}
                  onToggleItem={handleToggleItem}
                  onDeleteItem={handleDeleteItem}
                  onClearBought={clearBought}
                  onClearList={() => setPendingClearList(true)}
                  onCopyList={handleCopyList}
                  onOpenShoppingMode={() => setShoppingModeOpen(true)}
                  onOpenCategory={(item) => setSelectedItem(item)}
                  onOpenBudget={() => setBudgetDialogOpen(true)}
                  onReviewBudget={() => setBudgetReviewOpen(true)}
                />
              )}
              {activeScreen === "suggestions" && (
                <SuggestionsScreen
                  templates={templates}
                  purchaseEvents={purchaseEvents}
                  isEnabled={settings.enableAiSuggestions}
                  onAddText={handleAddText}
                  onApplyTemplate={handleApplyTemplate}
                  onOpenSettings={() => selectScreen("settings")}
                />
              )}
              {activeScreen === "templates" && (
                <TemplatesScreen
                  templates={templates}
                  onApplyTemplate={handleApplyTemplate}
                />
              )}
              {activeScreen === "history" && (
                <HistoryScreen
                  purchaseEvents={purchaseEvents}
                  priceObservations={priceObservations}
                  onOpenPrice={(event) =>
                    setPriceTargetItem({
                      id: event.itemId,
                      shoppingListId: event.shoppingListId,
                      purchaseEventId: event.id,
                      name: event.itemName,
                      normalizedName: event.normalizedName,
                      quantity: event.quantity,
                      unit: event.unit,
                    })
                  }
                />
              )}
              {activeScreen === "settings" && (
                <SettingsScreen
                  settings={settings}
                  canInstall={Boolean(installPrompt)}
                  onUpdateSettings={updateSettings}
                  onInstall={handleInstall}
                  onExport={handleExport}
                  onImport={handleImport}
                  onReset={() => setPendingReset(true)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
      <BottomNavigation activeScreen={activeScreen} onSelect={selectScreen} />
      <AnimatePresence>
        {isShoppingModeOpen && (
          <ShoppingMode
            items={currentListItems}
            listMeta={currentListMeta}
            budgetSummary={currentBudgetSummary}
            showBought={showBoughtInShoppingMode}
            onClose={() => setShoppingModeOpen(false)}
            onSetShowBought={setShowBoughtInShoppingMode}
            onToggleItem={handleToggleItem}
            onDeleteItem={handleDeleteItem}
            onOpenCategory={(item) => setSelectedItem(item)}
            onReviewBudget={() => setBudgetReviewOpen(true)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedItem && (
          <CategoryDialog
            item={selectedItem}
            currency={selectedItemCurrency}
            priceStats={selectedItemPriceStats}
            onClose={() => setSelectedItem(null)}
            onSelect={async (categoryId) => {
              const updatedItem = await setItemCategory(selectedItem.id, categoryId);
              if (updatedItem) {
                setSelectedItem(updatedItem);
                showToast(copy.toasts.categoryUpdated);
              }
            }}
            onSetNecessity={async (necessity) => {
              const updatedItem = await setItemNecessity(selectedItem.id, necessity);
              if (updatedItem) {
                setSelectedItem(updatedItem);
              }
            }}
            onUpdate={async (changes) => {
              const updatedItem = await updateItem(selectedItem.id, changes);
              if (updatedItem) {
                setSelectedItem(updatedItem);
              }
            }}
            onAddPrice={() => {
              setSelectedItem(null);
              setPriceTargetItem(selectedItem);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isBudgetDialogOpen && currentShoppingListId && (
          <BudgetDialog
            meta={currentListMeta}
            defaultCurrency={settings.currency}
            isCurrencyLocked={(currentBudgetSummary?.pricedCount ?? 0) > 0}
            onClose={() => setBudgetDialogOpen(false)}
            onRemove={handleRemoveBudget}
            onSave={handleSaveBudget}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {priceTargetItem && (
          <PriceDialog
            item={priceTargetItem}
            observations={priceObservations}
            currency={
              shoppingListMeta.find(
                (meta) => meta.shoppingListId === priceTargetItem.shoppingListId,
              )?.currency ?? settings.currency
            }
            countryCode={
              shoppingListMeta.find(
                (meta) => meta.shoppingListId === priceTargetItem.shoppingListId,
              )?.countryCode ?? "UA"
            }
            onClose={() => setPriceTargetItem(null)}
            onSave={(amountMinor, packageQuantity, packageUnit) =>
              handleSavePrice(
                priceTargetItem,
                amountMinor,
                packageQuantity,
                packageUnit,
              )
            }
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isBudgetReviewOpen && currentListMeta && currentBudgetSummary && (
          <BudgetReviewDialog
            items={currentListItems}
            observations={priceObservations}
            meta={currentListMeta}
            onClose={() => setBudgetReviewOpen(false)}
            onRemoveOptional={handleRemoveOptionalItems}
            onApplyQuantities={handleApplyQuantities}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pendingClearList && (
          <ConfirmDialog
            title={copy.confirms.clearListTitle}
            description={copy.confirms.clearListDescription}
            confirmLabel={copy.confirms.clearListConfirm}
            onCancel={() => setPendingClearList(false)}
            onConfirm={handleClearList}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pendingReset && (
          <ConfirmDialog
            title={copy.confirms.clearDataTitle}
            description={copy.confirms.clearDataDescription}
            confirmLabel={copy.confirms.clearDataConfirm}
            onCancel={() => setPendingReset(false)}
            onConfirm={handleReset}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <div
            className={`toast-region ${activeScreen === "list" && !isShoppingModeOpen ? "above-add-bar" : ""}`}
            role="status"
            aria-live="polite"
          >
            <motion.div
              className="toast"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
            >
              <CheckCircle2 size={17} />
              <span>{toast.message}</span>
              {toast.onAction && toast.actionLabel && (
                <button
                  className="toast-action"
                  type="button"
                  onClick={() => {
                    const toastAction = toast.onAction;

                    if (!toastAction) {
                      return;
                    }

                    setToast(null);
                    runAsyncAction(toastAction());
                  }}
                >
                  {toast.actionLabel}
                </button>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
        </main>
      </MotionConfig>
    </LocalizationContext.Provider>
  );
};

const LoadingState = () => {
  const { copy } = useLocalization();

  return (
    <main className="app-shell">
      <div className="app-frame">
        <section className="app-main">
          <div className="panel empty-state">
            <div className="empty-state-inner">
              <div className="empty-icon">
                <ShoppingBasket size={28} />
              </div>
              <h2>{copy.app.loadingTitle}</h2>
              <p>{copy.app.loadingDescription}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

const ErrorState = ({ onRetry }: { onRetry: () => void }) => {
  const { copy } = useLocalization();

  return (
    <main className="app-shell">
      <div className="app-frame single-panel-frame">
        <section className="app-main">
          <div className="panel empty-state">
            <div className="empty-state-inner">
              <div className="empty-icon error-icon">
                <RefreshCw size={27} />
              </div>
              <h2>{copy.app.errorTitle}</h2>
              <p>{copy.app.errorDescription}</p>
              <button className="button button-primary" type="button" onClick={onRetry}>
                <RefreshCw size={17} />
                {copy.app.retry}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

const Brand = () => {
  const { copy } = useLocalization();

  return (
    <div className="brand-mark">
      <div className="brand-icon">
        <ShoppingBasket size={21} strokeWidth={2.3} />
      </div>
      <div className="brand-copy">
        <span>{copy.app.brandTagline}</span>
        <strong>{copy.app.brandName}</strong>
      </div>
    </div>
  );
};

const DesktopNavigation = ({
  activeScreen,
  onSelect,
}: {
  activeScreen: ScreenId;
  onSelect: (screenId: ScreenId) => void;
}) => {
  const { copy } = useLocalization();

  return (
    <aside className="desktop-nav panel">
      <Brand />
      <nav className="desktop-nav-items" aria-label={copy.app.primaryNavigation}>
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`nav-item ${activeScreen === item.id ? "active" : ""}`}
              type="button"
              onClick={() => onSelect(item.id)}
            >
              <Icon size={19} />
              <span>{copy.navigation[item.id]}</span>
            </button>
          );
        })}
      </nav>
      <p className="desktop-nav-bottom">{copy.app.localData}</p>
    </aside>
  );
};

const BottomNavigation = ({
  activeScreen,
  onSelect,
}: {
  activeScreen: ScreenId;
  onSelect: (screenId: ScreenId) => void;
}) => {
  const { copy } = useLocalization();

  return (
    <nav className="bottom-nav" aria-label={copy.app.primaryNavigation}>
      {mobileNavigationOrder.map((screenId) => {
        const item = navigationItems.find((navigationItem) => navigationItem.id === screenId);

        if (!item) {
          return null;
        }

        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={`nav-item ${activeScreen === item.id ? "active" : ""}`}
            type="button"
            onClick={() => onSelect(item.id)}
          >
            <Icon aria-hidden="true" />
            <span>{copy.navigation[item.id]}</span>
          </button>
        );
      })}
    </nav>
  );
};

const TopBar = ({
  activeScreen,
  isOnline,
  onOpenShoppingMode,
  onOpenSettings,
}: {
  activeScreen: ScreenId;
  isOnline: boolean;
  onOpenShoppingMode: () => void;
  onOpenSettings: () => void;
}) => {
  const { copy } = useLocalization();

  return (
    <header className="topbar">
      <Brand />
      <div className="topbar-actions">
        {!isOnline && (
          <span className="offline-dot" title={copy.common.offline} aria-label={copy.common.offline}>
            <WifiOff size={0} />
          </span>
        )}
        {activeScreen === "list" && (
          <button
            className="icon-button"
            type="button"
            aria-label={copy.app.openShoppingMode}
            title={copy.app.shoppingMode}
            onClick={onOpenShoppingMode}
          >
            <ShoppingBasket size={20} />
          </button>
        )}
        {activeScreen !== "settings" && (
          <button
            className="icon-button"
            type="button"
            aria-label={copy.app.openSettings}
            title={copy.settings.title}
            onClick={onOpenSettings}
          >
            <Settings size={20} />
          </button>
        )}
      </div>
    </header>
  );
};

const ShoppingListScreen = ({
  items,
  settings,
  listMeta,
  budgetSummary,
  onAddText,
  onToggleItem,
  onDeleteItem,
  onClearBought,
  onClearList,
  onCopyList,
  onOpenShoppingMode,
  onOpenCategory,
  onOpenBudget,
  onReviewBudget,
}: {
  items: ShoppingItem[];
  settings: ShoppingSettings;
  listMeta?: ShoppingListMeta;
  budgetSummary: BudgetSummary | null;
  onAddText: (input: string) => Promise<void>;
  onToggleItem: (itemId: string) => Promise<unknown>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onClearBought: () => Promise<void>;
  onClearList: () => void;
  onCopyList: () => Promise<void>;
  onOpenShoppingMode: () => void;
  onOpenCategory: (item: ShoppingItem) => void;
  onOpenBudget: () => void;
  onReviewBudget: () => void;
}) => {
  const { copy, language } = useLocalization();
  const boughtItemsCount = items.filter((item) => item.isBought).length;
  const activeItems = settings.hideBoughtItems
    ? items.filter((item) => !item.isBought)
    : items;
  const groupedItems = groupItems(activeItems, settings.groupByCategory, language);
  const progress = items.length > 0 ? Math.round((boughtItemsCount / items.length) * 100) : 0;

  return (
    <div className="list-screen">
      <section className="overview-panel panel">
        <div className="page-title-row">
          <div>
            <p className="eyebrow">{copy.list.today}</p>
            <h1 className="page-title">{copy.list.title}</h1>
            <p className="page-subtitle">{copy.list.subtitle}</p>
          </div>
          {items.length > 0 && (
            <button
              className="icon-button list-clear-button"
              type="button"
              aria-label={copy.list.clearList}
              title={copy.list.clearList}
              onClick={onClearList}
            >
              <Trash2 size={19} />
            </button>
          )}
        </div>
        <div className="progress-block">
          <div className="progress-label-row">
            <span>{copy.list.done}</span>
            <span className="progress-value">
              {copy.list.progress(boughtItemsCount, items.length)}
            </span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={copy.list.progressAria(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {listMeta?.budgetAmountMinor !== undefined && budgetSummary && (
          <BudgetSummaryBar
            meta={listMeta}
            summary={budgetSummary}
            onEdit={onOpenBudget}
            onReview={onReviewBudget}
          />
        )}
        <div className="overview-actions">
          <button
            className="action-chip action-chip-primary"
            type="button"
            onClick={onOpenShoppingMode}
          >
            <ShoppingBasket size={16} />
            {copy.app.shoppingMode}
          </button>
          <button
            className="action-chip"
            type="button"
            onClick={() => runAsyncAction(onCopyList())}
          >
            <Copy size={15} />
            {copy.list.copyList}
          </button>
          {listMeta && listMeta.budgetAmountMinor === undefined && (
            <button
              className="action-chip action-chip-budget"
              type="button"
              onClick={onOpenBudget}
            >
              <Wallet size={16} />
              {copy.budget.addBudget}
            </button>
          )}
          {boughtItemsCount > 0 && (
            <button
              className="action-chip action-chip-clear"
              type="button"
              onClick={() => runAsyncAction(onClearBought())}
            >
              <ArchiveRestore size={15} />
              {copy.list.clearPurchased}
            </button>
          )}
        </div>
      </section>
      <AddItemBar onAddText={onAddText} />
      <section className="section-panel panel">
        {activeItems.length === 0 ? (
          <EmptyList onAddText={onAddText} />
        ) : (
          groupedItems.map((group) => (
            <CategorySection
              key={group.category.id}
              category={group.category}
              items={group.items}
              onToggleItem={onToggleItem}
              onDeleteItem={onDeleteItem}
              onOpenCategory={onOpenCategory}
            />
          ))
        )}
      </section>
    </div>
  );
};

const BudgetSummaryBar = ({
  meta,
  summary,
  onEdit,
  onReview,
  compact = false,
  allowReview = true,
}: {
  meta: ShoppingListMeta;
  summary: BudgetSummary;
  onEdit?: () => void;
  onReview: () => void;
  compact?: boolean;
  allowReview?: boolean;
}) => {
  const { copy, language } = useLocalization();
  const statusCopy: Record<BudgetStatus, string> = {
    within: copy.budget.within,
    risk: copy.budget.risk,
    over: copy.budget.over,
    partial: copy.budget.partial,
    unavailable: copy.budget.partial,
  };
  const shouldReview =
    allowReview && (summary.status === "risk" || summary.status === "over");
  const statusClass =
    summary.status === "over"
      ? "is-over"
      : summary.status === "risk"
        ? "is-risk"
        : "";

  return (
    <div className={`budget-summary ${statusClass} ${compact ? "compact" : ""}`}>
      <div className="budget-summary-head">
        <strong>{copy.budget.budget}</strong>
        <span className="budget-status">
          {summary.pricedCount === 0 ? copy.budget.noPrices : statusCopy[summary.status]}
        </span>
      </div>
      <div className="budget-values">
        <div className="budget-value">
          <span>{copy.budget.expected}</span>
          <strong>
            {summary.pricedCount === 0
              ? "—"
              : formatMinorRange(
                  summary.lowAmountMinor,
                  summary.highAmountMinor,
                  summary.currency,
                  language,
                )}
          </strong>
        </div>
        <div className="budget-value">
          <span>{copy.budget.budget}</span>
          <strong>
            {formatMinorCurrency(meta.budgetAmountMinor ?? 0, meta.currency, language)}
          </strong>
        </div>
      </div>
      <div className="budget-summary-meta">
        <span>{copy.budget.coverage(summary.pricedCount, summary.totalCount)}</span>
        <div className="budget-summary-actions">
          {onEdit && (
            <button
              className="small-button"
              type="button"
              aria-label={copy.budget.editBudget}
              title={copy.budget.editBudget}
              onClick={onEdit}
            >
              <Pencil size={14} />
            </button>
          )}
          {shouldReview && (
            <button className="small-button" type="button" onClick={onReview}>
              <AlertTriangle size={14} />
              {copy.budget.review}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const EmptyList = ({ onAddText }: { onAddText: (input: string) => Promise<void> }) => {
  const { copy } = useLocalization();

  return (
    <div className="empty-state">
      <div className="empty-state-inner">
        <div className="empty-icon">
          <ClipboardList size={28} />
        </div>
        <h2>{copy.list.emptyTitle}</h2>
        <p>{copy.list.emptyDescription}</p>
        <div className="chip-row" aria-label={copy.list.quickAdd}>
          {copy.quickProducts.map((product) => (
            <button
              key={product}
              className="quick-chip"
              type="button"
              onClick={() => runAsyncAction(onAddText(product))}
            >
              + {product}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const AddItemBar = ({
  onAddText,
}: {
  onAddText: (input: string) => Promise<void>;
}) => {
  const { copy } = useLocalization();
  const [input, setInput] = useState("");
  const [isAdding, setAdding] = useState(false);

  const submit = async () => {
    if (!input.trim() || isAdding) {
      return;
    }

    setAdding(true);

    try {
      await onAddText(input);
      setInput("");
    } catch {
      return;
    } finally {
      setAdding(false);
    }
  };

  return (
    <form
      className="add-bar"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="add-input-wrap">
        <Plus size={19} />
        <input
          className="add-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={copy.list.addItems}
          aria-label={copy.list.addItems}
          autoComplete="off"
        />
      </div>
      <button
        className="add-submit"
        type="submit"
        aria-label={copy.list.addItems}
        disabled={isAdding}
      >
        {isAdding ? <RefreshCw size={20} className="spin" /> : <Plus size={23} />}
      </button>
    </form>
  );
};

const CategorySection = ({
  category,
  items,
  onToggleItem,
  onDeleteItem,
  onOpenCategory,
  isShoppingMode = false,
}: {
  category: ShoppingCategory;
  items: ShoppingItem[];
  onToggleItem: (itemId: string) => Promise<unknown>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onOpenCategory: (item: ShoppingItem) => void;
  isShoppingMode?: boolean;
}) => {
  const Icon = getCategoryIcon(category.id);

  return (
    <section className="category-section">
      <div className="category-heading">
        <div className="category-name">
          <span className="category-icon" data-category={category.id}>
            <Icon size={15} />
          </span>
          {category.name}
        </div>
        <span className="category-count">{items.length}</span>
      </div>
      <div className="items-stack">
        {items.map((item) => (
          <ShoppingItemRow
            key={item.id}
            item={item}
            isShoppingMode={isShoppingMode}
            onToggleItem={onToggleItem}
            onDeleteItem={onDeleteItem}
            onOpenCategory={onOpenCategory}
          />
        ))}
      </div>
    </section>
  );
};

const ShoppingItemRow = ({
  item,
  isShoppingMode,
  onToggleItem,
  onDeleteItem,
  onOpenCategory,
}: {
  item: ShoppingItem;
  isShoppingMode: boolean;
  onToggleItem: (itemId: string) => Promise<unknown>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onOpenCategory: (item: ShoppingItem) => void;
}) => {
  const { copy, language } = useLocalization();
  const priceObservations = useShoppingStore((state) => state.priceObservations);
  const listMeta = useShoppingStore((state) =>
    state.shoppingListMeta.find((meta) => meta.shoppingListId === item.shoppingListId),
  );
  const priceStats = listMeta
    ? getProductPriceStats(
        {
          normalizedName: item.normalizedName,
          quantity: 1,
          unit: getPriceReferenceUnit(item.unit),
        },
        priceObservations,
        listMeta.currency,
        listMeta.countryCode,
      )
    : null;

  return (
    <article
      className={`item-row ${item.isBought ? "is-bought" : ""} ${isShoppingMode ? "shop-item" : ""}`}
    >
      <button
        className="item-toggle-area"
        type="button"
        aria-label={
          item.isBought ? copy.list.moveBack(item.name) : copy.list.markPurchased(item.name)
        }
        onClick={() => runAsyncAction(onToggleItem(item.id))}
      >
        <span
          className={`item-checkbox ${item.isBought ? "is-checked" : ""}`}
          aria-hidden="true"
        >
          <Check size={isShoppingMode ? 24 : 20} strokeWidth={3} />
        </span>
        <span className="item-copy">
          <span className="item-name">{item.name}</span>
          <span className="item-meta">
            {formatQuantity(item.quantity, item.unit, language)} · {getCategory(item.categoryId, language).name}
          </span>
          {priceStats && (
            <span className="item-price">
              {formatMinorCurrency(priceStats.lastAmountMinor, listMeta?.currency ?? "UAH", language)} /{" "}
              {formatQuantity(
                priceStats.referenceQuantity,
                priceStats.referenceUnit,
                language,
              )}
            </span>
          )}
        </span>
      </button>
      <button
        className="item-category-button"
        type="button"
        aria-label={copy.list.changeCategory(item.name)}
        title={copy.list.changeCategory(item.name)}
        onClick={() => onOpenCategory(item)}
      >
        <Tag size={isShoppingMode ? 19 : 17} />
      </button>
      <button
        className="item-menu-button"
        type="button"
        aria-label={copy.list.deleteItem(item.name)}
        onClick={() => runAsyncAction(onDeleteItem(item.id))}
      >
        <Trash2 size={isShoppingMode ? 19 : 17} />
      </button>
    </article>
  );
};

const SuggestionsScreen = ({
  templates,
  purchaseEvents,
  isEnabled,
  onAddText,
  onApplyTemplate,
  onOpenSettings,
}: {
  templates: ShoppingTemplate[];
  purchaseEvents: PurchaseEvent[];
  isEnabled: boolean;
  onAddText: (input: string) => Promise<void>;
  onApplyTemplate: (template: ShoppingTemplate) => Promise<void>;
  onOpenSettings: () => void;
}) => {
  const { copy, language } = useLocalization();
  const frequentProducts = getFrequentProducts(purchaseEvents);
  const hasPurchaseHistory = frequentProducts.length > 0;
  const shownProducts =
    hasPurchaseHistory
      ? frequentProducts
      : copy.quickProducts.map((item) => item.split(" ")[0]);
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const breakfastTemplate =
    templates.find((template) => template.id === "starter-breakfast") ?? templates[0];
  const localizedBreakfastTemplate = breakfastTemplate
    ? getLocalizedStarterTemplate(breakfastTemplate, language)
    : undefined;

  return (
    <div className="secondary-screen">
      <section className="screen-heading panel">
        <p className="eyebrow">{copy.suggestions.eyebrow}</p>
        <h1>{copy.suggestions.title}</h1>
        <p>{copy.suggestions.subtitle}</p>
      </section>
      {!isEnabled ? (
        <section className="panel empty-state">
          <div className="empty-state-inner">
            <div className="empty-icon">
              <Sparkles size={27} />
            </div>
            <h2>{copy.suggestions.disabledTitle}</h2>
            <p>{copy.suggestions.disabledDescription}</p>
            <button className="button button-secondary" type="button" onClick={onOpenSettings}>
              {copy.suggestions.openSettings}
            </button>
          </div>
        </section>
      ) : (
        <div className="suggestion-grid">
          <section className="suggestion-card panel">
            <div className="suggestion-card-top">
              <div className="suggestion-symbol">
                <BellRing size={19} />
              </div>
              <span className="eyebrow">
                {hasPurchaseHistory
                  ? copy.suggestions.frequentEyebrow
                  : copy.suggestions.starterEyebrow}
              </span>
            </div>
            <h2>
              {hasPurchaseHistory
                ? copy.suggestions.frequentTitle
                : copy.suggestions.starterTitle}
            </h2>
            <p>
              {hasPurchaseHistory
                ? copy.suggestions.frequentDescription
                : copy.suggestions.starterDescription}
            </p>
            <div className="suggested-products">
              {shownProducts.map((product) => (
                <button
                  key={product}
                  className={`suggested-product-button ${selectedProduct === product ? "is-selected" : ""}`}
                  type="button"
                  aria-pressed={selectedProduct === product}
                  onClick={() => setSelectedProduct(product)}
                >
                  {product}
                </button>
              ))}
            </div>
            <button
              className="button button-primary"
              type="button"
              disabled={!selectedProduct}
              onClick={() => selectedProduct && runAsyncAction(onAddText(selectedProduct))}
            >
              <Plus size={17} />
              {copy.suggestions.addToList}
            </button>
          </section>
          {localizedBreakfastTemplate && (
            <section className="suggestion-card panel">
              <div className="suggestion-card-top">
                <div className="suggestion-symbol">
                  <ShoppingBasket size={19} />
                </div>
                <span className="eyebrow">{copy.suggestions.readyEyebrow}</span>
              </div>
              <h2>{localizedBreakfastTemplate.name}</h2>
              <p>{copy.suggestions.readyDescription}</p>
              <div className="suggested-products">
                {localizedBreakfastTemplate.items.slice(0, 5).map((item) => (
                  <span key={item.normalizedName} className="product-pill">
                    {item.name}
                  </span>
                ))}
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => runAsyncAction(onApplyTemplate(localizedBreakfastTemplate))}
              >
                <Plus size={17} />
                {copy.suggestions.addSet}
              </button>
            </section>
          )}
          <section className="suggestion-card panel">
            <div className="suggestion-card-top">
              <div className="suggestion-symbol">
                <Clock3Icon />
              </div>
              <span className="eyebrow">{copy.suggestions.rhythmEyebrow}</span>
            </div>
            <h2>{copy.suggestions.rhythmTitle}</h2>
            <p>{copy.suggestions.rhythmDescription}</p>
          </section>
        </div>
      )}
    </div>
  );
};

const Clock3Icon = () => <History size={19} />;

const TemplatesScreen = ({
  templates,
  onApplyTemplate,
}: {
  templates: ShoppingTemplate[];
  onApplyTemplate: (template: ShoppingTemplate) => Promise<void>;
}) => {
  const { copy, language } = useLocalization();

  return (
    <div className="secondary-screen">
      <section className="screen-heading panel">
        <p className="eyebrow">{copy.templates.eyebrow}</p>
        <h1>{copy.templates.title}</h1>
        <p>{copy.templates.subtitle}</p>
      </section>
      <div className="template-grid">
        {templates.map((template) => {
          const localizedTemplate = getLocalizedStarterTemplate(template, language);
          const Icon = getTemplateIcon(template.id);

          return (
            <section className="template-card panel" key={template.id}>
              <div className="template-card-top">
                <span className="template-icon">
                  <Icon size={20} />
                </span>
                <span className="category-count">{localizedTemplate.items.length}</span>
              </div>
              <h2>{localizedTemplate.name}</h2>
              <p>{localizedTemplate.items.map((item) => item.name).join(" · ")}</p>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => runAsyncAction(onApplyTemplate(localizedTemplate))}
              >
                <Plus size={17} />
                {copy.templates.addItems}
              </button>
            </section>
          );
        })}
      </div>
    </div>
  );
};

const HistoryScreen = ({
  purchaseEvents,
  priceObservations,
  onOpenPrice,
}: {
  purchaseEvents: PurchaseEvent[];
  priceObservations: PriceObservation[];
  onOpenPrice: (event: PurchaseEvent) => void;
}) => {
  const { copy, language } = useLocalization();
  const historyGroups = getHistoryGroups(purchaseEvents, language);

  return (
    <div className="secondary-screen">
      <section className="screen-heading panel">
        <p className="eyebrow">{copy.history.eyebrow}</p>
        <h1>{copy.history.title}</h1>
        <p>{copy.history.subtitle}</p>
      </section>
      {historyGroups.length === 0 ? (
        <section className="panel empty-state">
          <div className="empty-state-inner">
            <div className="empty-icon">
              <History size={28} />
            </div>
            <h2>{copy.history.emptyTitle}</h2>
            <p>{copy.history.emptyDescription}</p>
          </div>
        </section>
      ) : (
        <div className="history-stack">
          {historyGroups.map((group) => (
            <section className="history-day" key={group.dateKey}>
              <h2 className="history-day-title">{group.label}</h2>
              <div className="history-day-lists">
                {group.lists.map((list) => {
                  const actualTotal = getActualListTotal(list.events, priceObservations);

                  return (
                    <article className="history-card panel" key={list.shoppingListId}>
                      <div className="history-card-top">
                        <div>
                          <h3>{copy.history.listAt(formatTime(list.completedAt, language))}</h3>
                          <p>{copy.history.count(list.events.length)}</p>
                          {actualTotal.pricedCount > 0 && actualTotal.currency && (
                            <p className="history-total">
                              {copy.history.recordedTotal(
                                formatMinorCurrency(
                                  actualTotal.amountMinor,
                                  actualTotal.currency,
                                  language,
                                ),
                                actualTotal.pricedCount,
                                actualTotal.totalCount,
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="history-items">
                        {list.events.map((event) => {
                          const hasRecordedPrice =
                            event.actualAmountMinor !== undefined &&
                            event.actualCurrency !== undefined;
                          const priceActionLabel = hasRecordedPrice
                            ? copy.price.editPriceFor(event.itemName)
                            : copy.price.addPriceFor(event.itemName);

                          return (
                            <button
                              className={`history-price-button ${hasRecordedPrice ? "has-price" : ""}`}
                              type="button"
                              key={event.id}
                              aria-label={priceActionLabel}
                              title={priceActionLabel}
                              onClick={() => onOpenPrice(event)}
                            >
                              <span>
                                {event.itemName}{" "}
                                {formatQuantity(event.quantity, event.unit, language)}
                              </span>
                              {hasRecordedPrice ? <Pencil size={13} /> : <Wallet size={13} />}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

const SettingsScreen = ({
  settings,
  canInstall,
  onUpdateSettings,
  onInstall,
  onExport,
  onImport,
  onReset,
}: {
  settings: ShoppingSettings;
  canInstall: boolean;
  onUpdateSettings: (settingsUpdate: ShoppingSettingsUpdate) => Promise<unknown>;
  onInstall: () => Promise<void>;
  onExport: () => Promise<void>;
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onReset: () => void;
}) => {
  const { copy, language } = useLocalization();

  return (
    <div className="secondary-screen">
      <section className="screen-heading panel">
        <p className="eyebrow">{copy.settings.eyebrow}</p>
        <h1>{copy.settings.title}</h1>
        <p>{copy.settings.subtitle}</p>
      </section>
      <section className="settings-stack">
        <div>
          <p className="setting-group-title">{copy.settings.appearance}</p>
          <div className="settings-card panel">
            <SettingLine title={copy.settings.language} description={copy.settings.languageDescription}>
              <LanguageSelector
                language={language}
                onChange={(nextLanguage) =>
                  runAsyncAction(onUpdateSettings({ language: nextLanguage }))
                }
              />
            </SettingLine>
            <SettingLine title={copy.settings.currency} description={copy.settings.currencyDescription}>
              <CurrencySelector
                currency={settings.currency}
                onChange={(currency) =>
                  runAsyncAction(onUpdateSettings({ currency }))
                }
              />
            </SettingLine>
            <SettingLine title={copy.settings.theme} description={copy.settings.themeDescription}>
              <ThemeSelector
                theme={settings.theme}
                onChange={(theme) => runAsyncAction(onUpdateSettings({ theme }))}
              />
            </SettingLine>
            <SettingLine
              title={copy.settings.hidePurchased}
              description={copy.settings.hidePurchasedDescription}
            >
              <Toggle
                label={copy.settings.hidePurchased}
                checked={settings.hideBoughtItems}
                onChange={() =>
                  runAsyncAction(
                    onUpdateSettings({ hideBoughtItems: !settings.hideBoughtItems }),
                  )
                }
              />
            </SettingLine>
            <SettingLine
              title={copy.settings.groupByCategory}
              description={copy.settings.groupByCategoryDescription}
            >
              <Toggle
                label={copy.settings.groupByCategory}
                checked={settings.groupByCategory}
                onChange={() =>
                  runAsyncAction(
                    onUpdateSettings({ groupByCategory: !settings.groupByCategory }),
                  )
                }
              />
            </SettingLine>
          </div>
        </div>
        <div>
          <p className="setting-group-title">{copy.settings.suggestions}</p>
          <div className="settings-card panel">
            <SettingLine title={copy.settings.showIdeas} description={copy.settings.showIdeasDescription}>
              <Toggle
                label={copy.settings.showIdeas}
                checked={settings.enableAiSuggestions}
                onChange={() =>
                  runAsyncAction(
                    onUpdateSettings({
                      enableAiSuggestions: !settings.enableAiSuggestions,
                    }),
                  )
                }
              />
            </SettingLine>
          </div>
        </div>
        <div>
          <p className="setting-group-title">{copy.settings.data}</p>
          <div className="settings-card panel">
            <SettingLine
              title={copy.settings.installApp}
              description={
                canInstall ? copy.settings.installAvailable : copy.settings.installUnavailable
              }
            >
              <button
                className="small-button"
                type="button"
                onClick={() => runAsyncAction(onInstall())}
              >
                <PanelTopOpen size={15} />
                {copy.settings.install}
              </button>
            </SettingLine>
            <SettingLine title={copy.settings.exportData} description={copy.settings.exportDescription}>
              <button
                className="small-button"
                type="button"
                onClick={() => runAsyncAction(onExport())}
              >
                <FileDown size={15} />
                {copy.settings.export}
              </button>
            </SettingLine>
            <SettingLine title={copy.settings.importData} description={copy.settings.importDescription}>
              <label className="small-button" htmlFor="import-shopping-list">
                <FileUp size={15} />
                {copy.settings.import}
                <input
                  id="import-shopping-list"
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={(event) => void onImport(event)}
                />
              </label>
            </SettingLine>
            <SettingLine title={copy.settings.clearData} description={copy.settings.clearDataDescription}>
              <button className="small-button button-danger" type="button" onClick={onReset}>
                <Trash2 size={15} />
                {copy.common.clear}
              </button>
            </SettingLine>
          </div>
        </div>
      </section>
    </div>
  );
};

const SettingLine = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <div className="setting-line">
    <div className="setting-line-copy">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
    {children}
  </div>
);

const ThemeSelector = ({
  theme,
  onChange,
}: {
  theme: ThemePreference;
  onChange: (theme: ThemePreference) => void;
}) => {
  const { copy } = useLocalization();
  const themeOptions: Array<{ id: ThemePreference; label: string; icon: LucideIcon }> = [
    { id: "system", label: copy.settings.system, icon: Monitor },
    { id: "light", label: copy.settings.light, icon: Sun },
    { id: "dark", label: copy.settings.dark, icon: Moon },
  ];

  return (
    <div className="segmented-control" aria-label={copy.settings.themeLabel}>
      {themeOptions.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            className={`segment ${theme === option.id ? "active" : ""}`}
            type="button"
            title={option.label}
            aria-label={option.label}
            onClick={() => onChange(option.id)}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
};

const LanguageSelector = ({
  language,
  onChange,
}: {
  language: DisplayLanguage;
  onChange: (language: DisplayLanguage) => void;
}) => {
  const { copy } = useLocalization();

  return (
    <div className="segmented-control" aria-label={copy.settings.language}>
      <button
        className={`segment language-segment ${language === "en" ? "active" : ""}`}
        type="button"
        lang="en"
        aria-label="English"
        aria-pressed={language === "en"}
        onClick={() => onChange("en")}
      >
        EN
      </button>
      <button
        className={`segment language-segment ${language === "uk" ? "active" : ""}`}
        type="button"
        lang="uk"
        aria-label="Українська"
        aria-pressed={language === "uk"}
        onClick={() => onChange("uk")}
      >
        UA
      </button>
    </div>
  );
};

const CurrencySelector = ({
  currency,
  onChange,
}: {
  currency: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
}) => {
  const { copy } = useLocalization();
  const currencies: CurrencyCode[] = ["UAH", "USD", "EUR", "PLN"];

  return (
    <select
      className="field-select currency-select"
      value={currency}
      aria-label={copy.settings.currency}
      onChange={(event) => onChange(event.target.value as CurrencyCode)}
    >
      {currencies.map((currencyCode) => (
        <option key={currencyCode} value={currencyCode}>
          {currencyCode}
        </option>
      ))}
    </select>
  );
};

const Toggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <button
    className={`switch ${checked ? "is-on" : ""}`}
    type="button"
    role="switch"
    aria-label={label}
    aria-checked={checked}
    onClick={onChange}
  />
);

const ShoppingMode = ({
  items,
  listMeta,
  budgetSummary,
  showBought,
  onClose,
  onSetShowBought,
  onToggleItem,
  onDeleteItem,
  onOpenCategory,
  onReviewBudget,
}: {
  items: ShoppingItem[];
  listMeta?: ShoppingListMeta;
  budgetSummary: BudgetSummary | null;
  showBought: boolean;
  onClose: () => void;
  onSetShowBought: (value: boolean) => void;
  onToggleItem: (itemId: string) => Promise<unknown>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onOpenCategory: (item: ShoppingItem) => void;
  onReviewBudget: () => void;
}) => {
  const { copy, language } = useLocalization();
  const boughtItemsCount = items.filter((item) => item.isBought).length;
  const modeItems = showBought ? items : items.filter((item) => !item.isBought);
  const groupedItems = groupItems(modeItems, true, language);
  const progress = items.length > 0 ? Math.round((boughtItemsCount / items.length) * 100) : 0;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.section
      className="shopping-mode"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shopping-mode-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="shopping-mode-frame">
        <header className="shopping-mode-head">
          <div>
            <p>{copy.mode.eyebrow}</p>
            <h1 id="shopping-mode-title">{copy.mode.title}</h1>
          </div>
          <div className="mode-actions">
            <button
              className={`small-button ${showBought ? "" : "button-secondary"}`}
              type="button"
              onClick={() => onSetShowBought(!showBought)}
            >
              {showBought ? copy.mode.hidePurchased : copy.mode.showPurchased}
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label={copy.mode.close}
              onClick={onClose}
            >
              <ArrowLeft size={20} />
            </button>
          </div>
        </header>
        <section className="shop-progress panel">
          <div className="progress-label-row">
            <span>{copy.mode.purchased}</span>
            <span className="progress-value">
              {boughtItemsCount} / {items.length}
            </span>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={copy.list.progressAria(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </section>
        {listMeta?.budgetAmountMinor !== undefined && budgetSummary && (
          <BudgetSummaryBar
            meta={listMeta}
            summary={budgetSummary}
            onReview={onReviewBudget}
            compact
          />
        )}
        <section className="section-panel panel">
          {modeItems.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-inner">
                <div className="empty-icon">
                  <CheckCircle2 size={28} />
                </div>
                <h2>{items.length > 0 ? copy.mode.allPurchasedTitle : copy.mode.emptyTitle}</h2>
                <p>
                  {items.length > 0
                    ? copy.mode.allPurchasedDescription
                    : copy.mode.emptyDescription}
                </p>
              </div>
            </div>
          ) : (
            groupedItems.map((group) => (
              <CategorySection
                key={group.category.id}
                category={group.category}
                items={group.items}
                isShoppingMode
                onToggleItem={onToggleItem}
                onDeleteItem={onDeleteItem}
                onOpenCategory={onOpenCategory}
              />
            ))
          )}
        </section>
      </div>
    </motion.section>
  );
};

const CategoryDialog = ({
  item,
  currency,
  priceStats,
  onClose,
  onSelect,
  onSetNecessity,
  onUpdate,
  onAddPrice,
}: {
  item: ShoppingItem;
  currency: CurrencyCode;
  priceStats: ProductPriceStats | null;
  onClose: () => void;
  onSelect: (categoryId: string) => Promise<void>;
  onSetNecessity: (necessity: ItemNecessity) => Promise<void>;
  onUpdate: (changes: { name: string; quantity: number; unit: ShoppingUnit }) => Promise<void>;
  onAddPrice: () => void;
}) => {
  const { copy, language } = useLocalization();
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState<ShoppingUnit>(item.unit);
  const [isSaving, setSaving] = useState(false);
  const parsedQuantity = Number(quantity.replace(",", "."));
  const isQuantityValid = Number.isFinite(parsedQuantity) && parsedQuantity > 0;
  const availableUnits =
    item.isBought && priceStats
      ? shoppingUnits.filter((candidate) => arePriceUnitsCompatible(candidate, item.unit))
      : shoppingUnits;

  useEffect(() => {
    setName(item.name);
    setQuantity(String(item.quantity));
    setUnit(item.unit);
  }, [item]);

  const saveItemDetails = async () => {
    if (!name.trim() || !isQuantityValid || isSaving) {
      return;
    }

    setSaving(true);
    try {
      await onUpdate({ name: name.trim(), quantity: parsedQuantity, unit });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogFrame onClose={onClose}>
      <div className="dialog-content">
        <h2 id="dialog-title">{copy.categoryDialog.title}</h2>
        <p id="dialog-description">{copy.categoryDialog.description(item.name)}</p>
        <div className="dialog-section">
          <h3>{copy.categoryDialog.detailsTitle}</h3>
          <div className="dialog-form form-grid">
            <label className="field-label is-wide">
              {copy.categoryDialog.nameLabel}
              <input
                className="field-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field-label">
              {copy.categoryDialog.quantityLabel}
              <input
                className="field-input"
                type="text"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label className="field-label">
              {copy.categoryDialog.unitLabel}
              <select
                className="field-select"
                value={unit}
                onChange={(event) => setUnit(event.target.value as ShoppingUnit)}
              >
                {availableUnits.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {getUnitLabel(candidate, language)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            className="button button-secondary"
            type="button"
            disabled={!name.trim() || !isQuantityValid || isSaving}
            onClick={() => void saveItemDetails()}
          >
            <Pencil size={17} />
            {copy.categoryDialog.saveChanges}
          </button>
        </div>
        <div className="dialog-section">
          <h3>{copy.categoryDialog.categoryTitle}</h3>
          <div className="category-options">
            {defaultCategories.map((category) => (
              <button
                key={category.id}
                className={`category-option ${category.id === item.categoryId ? "is-active" : ""}`}
                type="button"
                onClick={() => runAsyncAction(onSelect(category.id))}
              >
                {getCategory(category.id, language).name}
              </button>
            ))}
          </div>
        </div>
        <div className="dialog-section">
          <div className="item-setting-line">
            <div className="item-setting-copy">
              <strong>{copy.categoryDialog.optional}</strong>
              <span>{copy.categoryDialog.optionalDescription}</span>
            </div>
            <Toggle
              label={copy.categoryDialog.optional}
              checked={item.necessity === "optional"}
              onChange={() =>
                runAsyncAction(
                  onSetNecessity(
                    item.necessity === "optional" ? "required" : "optional",
                  ),
                )
              }
            />
          </div>
        </div>
        <div className="dialog-section">
          <h3>{copy.categoryDialog.priceHistory}</h3>
          {priceStats ? (
            <div className={`price-stats ${priceStats.count === 1 ? "single" : ""}`}>
              <div className="price-stat">
                <span>{copy.price.last}</span>
                <strong>
                  {formatMinorCurrency(priceStats.lastAmountMinor, currency, language)} /{" "}
                  {formatQuantity(
                    priceStats.referenceQuantity,
                    priceStats.referenceUnit,
                    language,
                  )}
                </strong>
              </div>
              {priceStats.count > 1 && (
                <>
                  <div className="price-stat">
                    <span>{copy.price.average}</span>
                    <strong>
                      {formatMinorCurrency(
                        priceStats.averageAmountMinor,
                        currency,
                        language,
                      )}{" "}
                      /{" "}
                      {formatQuantity(
                        priceStats.referenceQuantity,
                        priceStats.referenceUnit,
                        language,
                      )}
                    </strong>
                  </div>
                  <div className="price-stat">
                    <span>{copy.price.change}</span>
                    <strong>
                      {priceStats.changePercent === undefined
                        ? "—"
                        : `${priceStats.changePercent > 0 ? "+" : ""}${priceStats.changePercent}%`}
                    </strong>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p>{copy.categoryDialog.noPriceHistory}</p>
          )}
          {item.isBought && (
            <button className="button button-secondary" type="button" onClick={onAddPrice}>
              <Wallet size={17} />
              {copy.price.addPrice}
            </button>
          )}
        </div>
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>
            {copy.common.cancel}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
};

const BudgetDialog = ({
  meta,
  defaultCurrency,
  isCurrencyLocked,
  onClose,
  onRemove,
  onSave,
}: {
  meta?: ShoppingListMeta;
  defaultCurrency: CurrencyCode;
  isCurrencyLocked: boolean;
  onClose: () => void;
  onRemove: () => Promise<void>;
  onSave: (budgetAmountMinor: number, currency: CurrencyCode) => Promise<void>;
}) => {
  const { copy } = useLocalization();
  const [amount, setAmount] = useState(
    meta?.budgetAmountMinor === undefined ? "" : String(meta.budgetAmountMinor / 100),
  );
  const [currency, setCurrency] = useState<CurrencyCode>(meta?.currency ?? defaultCurrency);
  const [isSaving, setSaving] = useState(false);
  const amountMinor = parseAmountMinor(amount);

  const submit = async () => {
    if (amountMinor === null || isSaving) {
      return;
    }

    setSaving(true);
    try {
      await onSave(amountMinor, currency);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogFrame onClose={onClose}>
      <form
        className="dialog-content"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="dialog-title">{copy.budget.dialogTitle}</h2>
        <p id="dialog-description">{copy.budget.dialogDescription}</p>
        <div className="dialog-form form-grid">
          <label className="field-label">
            {copy.budget.amountLabel}
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={amount}
              autoFocus
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="field-label">
            {copy.settings.currency}
            <select
              className="field-select"
              value={currency}
              disabled={isCurrencyLocked}
              onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
            >
              {(["UAH", "USD", "EUR", "PLN"] as CurrencyCode[]).map(
                (currencyCode) => (
                  <option key={currencyCode} value={currencyCode}>
                    {currencyCode}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <div className="dialog-actions">
          {meta?.budgetAmountMinor !== undefined && (
            <button
              className="button button-danger"
              type="button"
              onClick={() => runAsyncAction(onRemove())}
            >
              {copy.budget.removeBudget}
            </button>
          )}
          <button className="button button-quiet" type="button" onClick={onClose}>
            {copy.common.cancel}
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={amountMinor === null || isSaving}
          >
            {copy.common.save}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
};

const PriceDialog = ({
  item,
  observations,
  currency,
  countryCode,
  onClose,
  onSave,
}: {
  item: PriceEntryTarget;
  observations: PriceObservation[];
  currency: CurrencyCode;
  countryCode: string;
  onClose: () => void;
  onSave: (
    amountMinor: number,
    packageQuantity: number,
    packageUnit: ShoppingUnit,
  ) => Promise<void>;
}) => {
  const { copy, language } = useLocalization();
  const compatibleObservations = observations
    .filter(
      (observation) =>
        observation.source === "manual" &&
        observation.normalizedName === item.normalizedName &&
        observation.currency === currency &&
        observation.countryCode === countryCode &&
        arePriceUnitsCompatible(observation.packageUnit, item.unit),
    )
    .sort(
      (firstObservation, secondObservation) =>
        secondObservation.observedAt - firstObservation.observedAt,
    );
  const eventObservation = item.purchaseEventId
    ? compatibleObservations.find(
        (observation) => observation.purchaseEventId === item.purchaseEventId,
      )
    : undefined;
  const latestObservation = eventObservation ?? compatibleObservations[0];
  const defaultPackageQuantity =
    latestObservation?.packageQuantity ??
    (item.unit === "pcs" && item.quantity > 1 ? item.quantity : 1);
  const [amount, setAmount] = useState(
    latestObservation ? String(latestObservation.amountMinor / 100) : "",
  );
  const [packageQuantity, setPackageQuantity] = useState(
    String(defaultPackageQuantity),
  );
  const [packageUnit, setPackageUnit] = useState<ShoppingUnit>(
    latestObservation?.packageUnit ?? item.unit,
  );
  const [isSaving, setSaving] = useState(false);
  const amountMinor = parseAmountMinor(amount);
  const parsedPackageQuantity = Number(packageQuantity.replace(",", "."));
  const isPackageQuantityValid =
    Number.isFinite(parsedPackageQuantity) && parsedPackageQuantity > 0;

  const submit = async () => {
    if (amountMinor === null || !isPackageQuantityValid || isSaving) {
      return;
    }

    setSaving(true);
    try {
      await onSave(amountMinor, parsedPackageQuantity, packageUnit);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogFrame onClose={onClose}>
      <form
        className="dialog-content"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="dialog-title">{copy.price.dialogTitle(item.name)}</h2>
        <p id="dialog-description">{copy.price.dialogDescription}</p>
        <div className="dialog-form form-grid">
          <label className="field-label is-wide">
            {copy.price.priceLabel} ({currency})
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={amount}
              autoFocus
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="field-label">
            {copy.price.packageQuantity}
            <input
              className="field-input"
              type="text"
              inputMode="decimal"
              value={packageQuantity}
              onChange={(event) => setPackageQuantity(event.target.value)}
            />
          </label>
          <label className="field-label">
            {copy.price.packageUnit}
            <select
              className="field-select"
              value={packageUnit}
              onChange={(event) => setPackageUnit(event.target.value as ShoppingUnit)}
            >
              {shoppingUnits
                .filter((unit) => arePriceUnitsCompatible(unit, item.unit))
                .map((unit) => (
                  <option key={unit} value={unit}>
                    {getUnitLabel(unit, language)}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>
            {copy.common.skip}
          </button>
          <button
            className="button button-primary"
            type="submit"
            disabled={amountMinor === null || !isPackageQuantityValid || isSaving}
          >
            {copy.common.save}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
};

const BudgetReviewDialog = ({
  items,
  observations,
  meta,
  onClose,
  onRemoveOptional,
  onApplyQuantities,
}: {
  items: ShoppingItem[];
  observations: PriceObservation[];
  meta: ShoppingListMeta;
  onClose: () => void;
  onRemoveOptional: (itemIds: string[]) => Promise<void>;
  onApplyQuantities: (quantities: Record<string, number>) => Promise<void>;
}) => {
  const { copy, language } = useLocalization();
  const optionalItems = items.filter(
    (item) => !item.isBought && item.necessity === "optional",
  );
  const adjustableItems = items.filter(
    (item) => !item.isBought && item.quantity > getQuantityStep(item.unit),
  );
  const [selectedOptionalItemIds, setSelectedOptionalItemIds] = useState(
    optionalItems.map((item) => item.id),
  );
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(adjustableItems.map((item) => [item.id, item.quantity])),
  );
  const availableAdjustableItems = adjustableItems.filter(
    (item) => !selectedOptionalItemIds.includes(item.id),
  );
  const changedQuantities = Object.fromEntries(
    availableAdjustableItems
      .filter((item) => quantities[item.id] !== item.quantity)
      .map((item) => [item.id, quantities[item.id]]),
  );
  const previewItems = items
    .filter((item) => !selectedOptionalItemIds.includes(item.id))
    .map((item) => ({
      ...item,
      quantity: quantities[item.id] ?? item.quantity,
    }));
  const previewSummary = getBudgetSummary(previewItems, observations, meta);

  const changeQuantity = (item: ShoppingItem, direction: -1 | 1) => {
    const step = getQuantityStep(item.unit);
    const currentQuantity = quantities[item.id] ?? item.quantity;
    const nextQuantity = Math.min(
      item.quantity,
      Math.max(step, Number((currentQuantity + step * direction).toFixed(2))),
    );

    setQuantities((currentQuantities) => ({
      ...currentQuantities,
      [item.id]: nextQuantity,
    }));
  };

  return (
    <DialogFrame onClose={onClose}>
      <div className="dialog-content">
        <h2 id="dialog-title">{copy.budget.reviewTitle}</h2>
        <p id="dialog-description">{copy.budget.reviewDescription}</p>
        <BudgetSummaryBar
          meta={meta}
          summary={previewSummary}
          onReview={() => undefined}
          compact
          allowReview={false}
        />
        <div className="dialog-section">
          <h3>{copy.budget.optionalItems}</h3>
          {optionalItems.length === 0 ? (
            <p>{copy.budget.noOptionalItems}</p>
          ) : (
            <div className="review-list">
              {optionalItems.map((item) => (
                <div className="review-item" key={item.id}>
                  <label className="review-check">
                    <input
                      type="checkbox"
                      checked={selectedOptionalItemIds.includes(item.id)}
                      onChange={(event) =>
                        setSelectedOptionalItemIds((currentIds) =>
                          event.target.checked
                            ? [...currentIds, item.id]
                            : currentIds.filter((itemId) => itemId !== item.id),
                        )
                      }
                    />
                    <span>{item.name}</span>
                  </label>
                  <span className="item-meta">
                    {formatQuantity(item.quantity, item.unit, language)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {optionalItems.length > 0 && (
            <button
              className="button button-danger"
              type="button"
              disabled={selectedOptionalItemIds.length === 0}
              onClick={() => runAsyncAction(onRemoveOptional(selectedOptionalItemIds))}
            >
              <Trash2 size={17} />
              {copy.budget.removeOptional(selectedOptionalItemIds.length)}
            </button>
          )}
        </div>
        <div className="dialog-section">
          <h3>{copy.budget.reduceQuantities}</h3>
          <p>{copy.budget.reduceHint}</p>
          {availableAdjustableItems.length > 0 && (
            <div className="review-list">
              {availableAdjustableItems.map((item) => (
                <div className="review-item" key={item.id}>
                  <span className="review-check">{item.name}</span>
                  <div className="quantity-control">
                    <button
                      type="button"
                      aria-label={`− ${item.name}`}
                      onClick={() => changeQuantity(item, -1)}
                    >
                      <Minus size={16} />
                    </button>
                    <input
                      value={quantities[item.id] ?? item.quantity}
                      aria-label={item.name}
                      readOnly
                    />
                    <button
                      type="button"
                      aria-label={`+ ${item.name}`}
                      disabled={(quantities[item.id] ?? item.quantity) >= item.quantity}
                      onClick={() => changeQuantity(item, 1)}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            className="button button-secondary"
            type="button"
            disabled={Object.keys(changedQuantities).length === 0}
            onClick={() => runAsyncAction(onApplyQuantities(changedQuantities))}
          >
            {copy.budget.applyQuantities}
          </button>
        </div>
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>
            {copy.common.cancel}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
};

const ConfirmDialog = ({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) => {
  const { copy } = useLocalization();

  return (
    <DialogFrame onClose={onCancel}>
      <div className="dialog-content">
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-description">{description}</p>
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" onClick={onCancel}>
            {copy.common.cancel}
          </button>
          <button
            className="button button-danger"
            type="button"
            onClick={() => runAsyncAction(onConfirm())}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
};

const DialogFrame = ({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) => {
  const dialogReference = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialogElement = dialogReference.current;
    const previouslyFocusedElement = document.activeElement as HTMLElement | null;

    if (!dialogElement) {
      return undefined;
    }

    const getFocusableElements = () =>
      Array.from(
        dialogElement.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );

    getFocusableElements()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocusedElement?.focus();
    };
  }, [onClose]);

  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.section
        ref={dialogReference}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
      >
        {children}
      </motion.section>
    </motion.div>
  );
};
