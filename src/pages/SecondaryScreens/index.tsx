import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  BellRing,
  FileDown,
  FileUp,
  History,
  Monitor,
  Moon,
  PanelTopOpen,
  Pencil,
  Plus,
  ShoppingBasket,
  Sparkles,
  Sun,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { useLocalization } from "../../contexts/LocalizationContext/useLocalization";
import { Toggle } from "../../components/Toggle";
import type {
  CurrencyCode,
  PriceObservation,
  PurchaseEvent,
  ShoppingSettings,
  ShoppingTemplate,
  ThemePreference,
} from "../../domain/types";
import { formatQuantity, formatTime } from "../../lib/format";
import { getLocalizedStarterTemplate, type DisplayLanguage } from "../../lib/localization";
import { getActualListTotal } from "../../pricing";
import type { AppInstallState, ShoppingSettingsUpdate } from "../../types/app";
import {
  formatMinorCurrency,
  getFrequentProducts,
  getHistoryGroups,
  runAsyncAction,
} from "../../utils/shopping";

export const SuggestionsScreen = ({
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
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const breakfastTemplate =
    templates.find((template) => template.id === "starter-breakfast") ?? templates[0];
  const localizedBreakfastTemplate = breakfastTemplate
    ? getLocalizedStarterTemplate(breakfastTemplate, language)
    : undefined;

  const toggleSelectedProduct = (product: string) => {
    setSelectedProducts((currentProducts) =>
      currentProducts.includes(product)
        ? currentProducts.filter((currentProduct) => currentProduct !== product)
        : [...currentProducts, product],
    );
  };

  const addSelectedProducts = async () => {
    if (selectedProducts.length === 0) {
      return;
    }

    await onAddText(selectedProducts.join(", "));
    setSelectedProducts([]);
  };

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
                  className={`suggested-product-button ${selectedProducts.includes(product) ? "is-selected" : ""}`}
                  type="button"
                  aria-pressed={selectedProducts.includes(product)}
                  onClick={() => toggleSelectedProduct(product)}
                >
                  {product}
                </button>
              ))}
            </div>
            <button
              className="button button-primary"
              type="button"
              disabled={selectedProducts.length === 0}
              onClick={() => runAsyncAction(addSelectedProducts())}
            >
              <Plus size={17} />
              {copy.suggestions.addToList}
              {selectedProducts.length > 0 && ` (${selectedProducts.length})`}
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

export const Clock3Icon = () => <History size={19} />;

export const HistoryScreen = ({
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

export const SettingsScreen = ({
  settings,
  installState,
  onUpdateSettings,
  onInstall,
  onExport,
  onImport,
  onReset,
}: {
  settings: ShoppingSettings;
  installState: AppInstallState;
  onUpdateSettings: (settingsUpdate: ShoppingSettingsUpdate) => Promise<unknown>;
  onInstall: () => Promise<void>;
  onExport: () => Promise<void>;
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onReset: () => void;
}) => {
  const { copy, language } = useLocalization();
  const importInputReference = useRef<HTMLInputElement | null>(null);
  const installDescription: Record<AppInstallState, string> = {
    available: copy.settings.installAvailable,
    ios: copy.settings.installIos,
    installed: copy.settings.installInstalled,
    unavailable: copy.settings.installUnavailable,
  };

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
              description={installDescription[installState]}
            >
              {(installState === "available" || installState === "ios") && (
                <button
                  className="small-button"
                  type="button"
                  onClick={() => runAsyncAction(onInstall())}
                >
                  <PanelTopOpen size={15} />
                  {installState === "ios"
                    ? copy.settings.installHelp
                    : copy.settings.install}
                </button>
              )}
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
              <>
                <button
                  className="small-button"
                  type="button"
                  onClick={() => importInputReference.current?.click()}
                >
                  <FileUp size={15} />
                  {copy.settings.import}
                </button>
                <input
                  ref={importInputReference}
                  id="import-shopping-list"
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={(event) => void onImport(event)}
                />
              </>
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

export const SettingLine = ({
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

export const ThemeSelector = ({
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
    <div className="segmented-control" role="group" aria-label={copy.settings.themeLabel}>
      {themeOptions.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.id}
            className={`segment ${theme === option.id ? "active" : ""}`}
            type="button"
            title={option.label}
            aria-label={option.label}
            aria-pressed={theme === option.id}
            onClick={() => onChange(option.id)}
          >
            <Icon size={15} />
          </button>
        );
      })}
    </div>
  );
};

export const LanguageSelector = ({
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
        УКР
      </button>
    </div>
  );
};

export const CurrencySelector = ({
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
