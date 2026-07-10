import { useEffect, useState, type ChangeEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

import type {
  CurrencyCode,
  ShoppingBackup,
  ShoppingItem,
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
import {
  HistoryScreen,
  SettingsScreen,
  SuggestionsScreen,
  TemplatesScreen,
} from "../pages/SecondaryScreens";
import { LocalizationProvider } from "../contexts/LocalizationContext";
import { useIsMobileViewport } from "../hooks/useIsMobileViewport";
import { getScreenFromPath, navigationItems } from "../navigation/constants";
import type {
  BeforeInstallPromptEvent,
  PriceEntryTarget,
  ScreenId,
  ToastState,
} from "../types/app";
import { getCurrentShoppingListId, getPriceReferenceUnit, runAsyncAction } from "../utils/shopping";

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
  const activeScreen = getScreenFromPath(location.pathname);
  const currentShoppingListId = getCurrentShoppingListId(items);
  const currentListMeta = currentShoppingListId
    ? shoppingListMeta.find((meta) => meta.shoppingListId === currentShoppingListId)
    : undefined;
  const currentListItems = currentShoppingListId
    ? items.filter((item) => item.shoppingListId === currentShoppingListId)
    : [];
  const unboughtItemsCount = items.filter((item) => !item.isBought).length;
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
    </LocalizationProvider>
  );
};
