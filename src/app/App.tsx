import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import type {
  CurrencyCode,
  ShoppingItem,
  ShoppingItemInput,
  ShoppingTemplate,
  ShoppingUnit,
} from "../domain/types";
import { formatShoppingList } from "../lib/format";
import { getAppCopy, resolveDisplayLanguage } from "../lib/localization";
import {
  getBudgetSummary,
  getProductPriceStats,
} from "../pricing";
import { useShoppingStore } from "../store/useShoppingStore";
import {
  BottomNavigation,
  DesktopNavigation,
  ErrorState,
  LoadingState,
  ScreenLoadingState,
  TopBar,
} from "../components/AppLayout";
import {
  BudgetReviewDialog,
  BudgetDialog,
  CategoryDialog,
  ConfirmDialog,
  PriceDialog,
} from "../features/Dialogs";
import { ShoppingListScreen } from "../features/ShoppingList";
import { ShoppingMode } from "../features/ShoppingMode";
import { LocalizationProvider } from "../contexts/LocalizationContext";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import { getScreenFromPath, navigationItems } from "../navigation/constants";
import { saveThemePreference } from "../storage/themePreference";
import type {
  PriceEntryTarget,
  ScreenId,
  ToastState,
} from "../types/app";
import { getCurrentShoppingListId, getPriceReferenceUnit, runAsyncAction } from "../utils/shopping";
import { usePwa } from "./usePwa";

const PantryRecipesScreen = lazy(async () => {
  const pantryRecipesModule = await import("../features/PantryRecipes");
  return { default: pantryRecipesModule.PantryRecipesScreen };
});

const SuggestionsScreen = lazy(async () => {
  const secondaryScreensModule = await import("../pages/SecondaryScreens");
  return { default: secondaryScreensModule.SuggestionsScreen };
});

const HistoryScreen = lazy(async () => {
  const secondaryScreensModule = await import("../pages/SecondaryScreens");
  return { default: secondaryScreensModule.HistoryScreen };
});

const SettingsScreen = lazy(async () => {
  const secondaryScreensModule = await import("../pages/SecondaryScreens");
  return { default: secondaryScreensModule.SettingsScreen };
});

const MAX_BACKUP_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    isReady,
    error,
    items,
    categories,
    templates,
    settings,
    purchaseEvents,
    shoppingListMeta,
    priceObservations,
    pantryItems,
    initialize,
    addFromText,
    toggleItem,
    deleteItem,
    deleteItems,
    restoreItem,
    restoreItems,
    addPantryItems,
    deletePantryItem,
    restorePantryItem,
    addRecipeIngredients,
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
    updateItemQuantities,
  } = useShoppingStore(
    useShallow((state) => ({
      isReady: state.isReady,
      error: state.error,
      items: state.items,
      categories: state.categories,
      templates: state.templates,
      settings: state.settings,
      purchaseEvents: state.purchaseEvents,
      shoppingListMeta: state.shoppingListMeta,
      priceObservations: state.priceObservations,
      pantryItems: state.pantryItems,
      initialize: state.initialize,
      addFromText: state.addFromText,
      toggleItem: state.toggleItem,
      deleteItem: state.deleteItem,
      deleteItems: state.deleteItems,
      restoreItem: state.restoreItem,
      restoreItems: state.restoreItems,
      addPantryItems: state.addPantryItems,
      deletePantryItem: state.deletePantryItem,
      restorePantryItem: state.restorePantryItem,
      addRecipeIngredients: state.addRecipeIngredients,
      clearBought: state.clearBought,
      clearItems: state.clearItems,
      applyTemplate: state.applyTemplate,
      updateSettings: state.updateSettings,
      exportData: state.exportData,
      importData: state.importData,
      resetData: state.resetData,
      setItemCategory: state.setItemCategory,
      setItemNecessity: state.setItemNecessity,
      updateItem: state.updateItem,
      setShoppingListBudget: state.setShoppingListBudget,
      savePriceObservation: state.savePriceObservation,
      updateItemQuantities: state.updateItemQuantities,
    })),
  );
  const [isShoppingModeOpen, setShoppingModeOpen] = useState(false);
  const [showBoughtInShoppingMode, setShowBoughtInShoppingMode] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ShoppingItem | null>(null);
  const [priceTargetItem, setPriceTargetItem] = useState<PriceEntryTarget | null>(null);
  const [isBudgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [isBudgetReviewOpen, setBudgetReviewOpen] = useState(false);
  const [pendingClearList, setPendingClearList] = useState(false);
  const [pendingReset, setPendingReset] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const {
    isOnline,
    installState,
    isUpdateAvailable,
    isOfflineReady,
    serviceWorkerError,
    installApp,
    updateApp,
    clearOfflineReady,
    clearServiceWorkerError,
  } = usePwa();

  const language = resolveDisplayLanguage(settings?.language);
  const copy = getAppCopy(language);
  const activeScreen = getScreenFromPath(location.pathname);
  const currentShoppingListId = useMemo(
    () => getCurrentShoppingListId(items),
    [items],
  );
  const currentListMeta = useMemo(
    () =>
      currentShoppingListId
        ? shoppingListMeta.find(
            (meta) => meta.shoppingListId === currentShoppingListId,
          )
        : undefined,
    [currentShoppingListId, shoppingListMeta],
  );
  const currentListItems = useMemo(
    () =>
      currentShoppingListId
        ? items.filter((item) => item.shoppingListId === currentShoppingListId)
        : [],
    [currentShoppingListId, items],
  );
  const unboughtItemsCount = useMemo(
    () => items.filter((item) => !item.isBought).length,
    [items],
  );
  const currentBudgetSummary = useMemo(
    () =>
      currentListMeta
        ? getBudgetSummary(currentListItems, priceObservations, currentListMeta)
        : null,
    [currentListItems, currentListMeta, priceObservations],
  );
  const selectedItemListMeta = useMemo(
    () =>
      selectedItem
        ? shoppingListMeta.find(
            (meta) => meta.shoppingListId === selectedItem.shoppingListId,
          )
        : undefined,
    [selectedItem, shoppingListMeta],
  );
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
    if (
      !isReady ||
      !("setAppBadge" in navigator) ||
      !("clearAppBadge" in navigator)
    ) {
      return;
    }

    if (unboughtItemsCount === 0) {
      runAsyncAction(navigator.clearAppBadge());
      return;
    }

    runAsyncAction(navigator.setAppBadge(unboughtItemsCount));
  }, [isReady, unboughtItemsCount]);

  useLayoutEffect(() => {
    const currentPath = location.pathname;
    const savedScrollPositions = scrollPositions.current;
    window.scrollTo({
      top: savedScrollPositions[currentPath] ?? 0,
      behavior: "auto",
    });

    return () => {
      savedScrollPositions[currentPath] = window.scrollY;
    };
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname === "/templates") {
      navigate("/pantry", { replace: true });
      return;
    }

    if (!navigationItems.some((item) => item.path === location.pathname)) {
      navigate("/", { replace: true });
    }
  }, [location.pathname, navigate]);

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
    if (!isOfflineReady) {
      return;
    }

    setToast({ message: copy.toasts.offlineReady });
    clearOfflineReady();
  }, [clearOfflineReady, copy.toasts.offlineReady, isOfflineReady]);

  useEffect(() => {
    if (!serviceWorkerError) {
      return;
    }

    if (import.meta.env.DEV) {
      console.error(serviceWorkerError);
    }

    setToast({ message: copy.toasts.updateFailed });
    clearServiceWorkerError();
  }, [clearServiceWorkerError, copy.toasts.updateFailed, serviceWorkerError]);

  const hasOpenOverlay =
    isShoppingModeOpen ||
    Boolean(selectedItem) ||
    Boolean(priceTargetItem) ||
    isBudgetDialogOpen ||
    isBudgetReviewOpen ||
    pendingClearList ||
    pendingReset;

  useBodyScrollLock(hasOpenOverlay);

  useEffect(() => {
    const themePreference = settings?.theme ?? "system";
    saveThemePreference(themePreference);
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
    document.title =
      activeScreen === "list"
        ? copy.app.documentTitle
        : `${copy.navigation[activeScreen]} · ${copy.app.brandName}`;
    document.querySelector('meta[name="description"]')?.setAttribute(
      "content",
      copy.app.documentDescription,
    );
  }, [activeScreen, copy, language]);

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
    await updateItemQuantities(quantities);
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
      if (selectedFile.size > MAX_BACKUP_FILE_SIZE_BYTES) {
        throw new Error("The backup file is too large.");
      }

      const parsedBackup: unknown = JSON.parse(await selectedFile.text());
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

  const handleClearBought = async () => {
    if (!currentShoppingListId) {
      return;
    }

    const result = await clearBought(currentShoppingListId);

    if (result.clearedCount > 0) {
      showToast(copy.toasts.purchasedMoved(result.pantryAddedCount));
    }
  };

  const handleAddPantryItems = async (input: string) => {
    const result = await addPantryItems(input);

    if (result.addedItems.length > 0) {
      showToast(copy.toasts.pantryItemAdded(result.addedItems.length));
      return;
    }

    if (result.existingCount > 0) {
      showToast(copy.toasts.pantryItemExists);
    }
  };

  const handleDeletePantryItem = async (itemId: string) => {
    const deletedItem = await deletePantryItem(itemId);

    if (!deletedItem) {
      return;
    }

    showToast(copy.toasts.pantryItemRemoved(deletedItem.name), {
      actionLabel: copy.common.undo,
      onAction: () => restorePantryItem(deletedItem),
    });
  };

  const handleAddRecipeIngredients = async (ingredients: ShoppingItemInput[]) => {
    const result = await addRecipeIngredients(ingredients, currentShoppingListId);

    if (result.addedItems.length === 0) {
      showToast(copy.toasts.recipeItemsAlreadyListed);
      return;
    }

    showToast(copy.toasts.recipeItemsAdded(result.addedItems.length), {
      actionLabel: copy.navigation.list,
      onAction: async () => selectScreen("list"),
    });
  };

  const handleInstall = async () => {
    const outcome = await installApp();

    if (outcome === "unavailable") {
      showToast(copy.toasts.installFromBrowser);
      return;
    }

    if (outcome === "accepted") {
      showToast(copy.toasts.appInstalled);
    }
  };

  if (error && !isReady) {
    return (
      <LocalizationProvider copy={copy} language={language}>
        <ErrorState onRetry={() => runAsyncAction(initialize())} />
      </LocalizationProvider>
    );
  }

  if (!isReady || !settings) {
    return (
      <LocalizationProvider copy={copy} language={language}>
        <LoadingState />
      </LocalizationProvider>
    );
  }

  return (
    <LocalizationProvider copy={copy} language={language}>
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
          <div className="screen-content" key={activeScreen}>
            <Suspense fallback={<ScreenLoadingState />}>
              {activeScreen === "list" && (
                <ShoppingListScreen
                  items={currentListItems}
                  categories={categories}
                  settings={settings}
                  listMeta={currentListMeta}
                  priceObservations={priceObservations}
                  budgetSummary={currentBudgetSummary}
                  onAddText={handleAddText}
                  onToggleItem={handleToggleItem}
                  onDeleteItem={handleDeleteItem}
                  onClearBought={() => runAsyncAction(handleClearBought())}
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
              {activeScreen === "pantry" && (
                <PantryRecipesScreen
                  pantryItems={pantryItems}
                  categories={categories}
                  isOnline={isOnline}
                  onAddPantryItems={handleAddPantryItems}
                  onDeletePantryItem={handleDeletePantryItem}
                  onAddRecipeIngredients={handleAddRecipeIngredients}
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
                  installState={installState}
                  onUpdateSettings={updateSettings}
                  onInstall={handleInstall}
                  onExport={handleExport}
                  onImport={handleImport}
                  onReset={() => setPendingReset(true)}
                />
              )}
            </Suspense>
          </div>
        </section>
      </div>
      <BottomNavigation activeScreen={activeScreen} onSelect={selectScreen} />
      {isShoppingModeOpen && (
          <ShoppingMode
            items={currentListItems}
            categories={categories}
            listMeta={currentListMeta}
            priceObservations={priceObservations}
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
      {selectedItem && (
          <CategoryDialog
            item={selectedItem}
            categories={categories}
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
      {pendingClearList && (
          <ConfirmDialog
            title={copy.confirms.clearListTitle}
            description={copy.confirms.clearListDescription}
            confirmLabel={copy.confirms.clearListConfirm}
            onCancel={() => setPendingClearList(false)}
            onConfirm={handleClearList}
          />
      )}
      {pendingReset && (
          <ConfirmDialog
            title={copy.confirms.clearDataTitle}
            description={copy.confirms.clearDataDescription}
            confirmLabel={copy.confirms.clearDataConfirm}
            onCancel={() => setPendingReset(false)}
            onConfirm={handleReset}
          />
      )}
      {(toast || isUpdateAvailable) && (
          <div
            className={`toast-region ${activeScreen === "list" && !isShoppingModeOpen ? "above-add-bar" : ""}`}
            role="status"
            aria-live="polite"
          >
            <div className="toast-stack">
              {isUpdateAvailable && (
                <div className="toast">
                  <CheckCircle2 size={17} />
                  <span>{copy.toasts.updateAvailable}</span>
                  <button
                    className="toast-action"
                    type="button"
                    onClick={() => runAsyncAction(updateApp())}
                  >
                    {copy.toasts.updateNow}
                  </button>
                </div>
              )}
              {toast && (
                <div className="toast">
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
                </div>
              )}
            </div>
          </div>
      )}
      </main>
    </LocalizationProvider>
  );
};
