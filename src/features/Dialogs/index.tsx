import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, Pencil, Plus, Trash2, Wallet } from "lucide-react";

import { useLocalization } from "../../contexts/LocalizationContext/useLocalization";
import type {
  CurrencyCode,
  ItemNecessity,
  PriceObservation,
  ShoppingCategory,
  ShoppingItem,
  ShoppingListMeta,
  ShoppingUnit,
} from "../../domain/types";
import { shoppingUnits } from "../../domain/types";
import { formatQuantity, getUnitLabel } from "../../lib/format";
import {
  arePriceUnitsCompatible,
  getBudgetSummary,
  type ProductPriceStats,
} from "../../pricing";
import type { PriceEntryTarget } from "../../types/app";
import {
  formatMinorCurrency,
  getCategory,
  getQuantityStep,
  parseAmountMinor,
  runAsyncAction,
} from "../../utils/shopping";
import { BudgetSummaryBar } from "../ShoppingList";
import { Toggle } from "../../components/Toggle";
import { useModalFocusTrap } from "../../hooks/useModalFocusTrap";

export const CategoryDialog = ({
  item,
  categories,
  currency,
  priceStats,
  onClose,
  onSelect,
  onSetNecessity,
  onUpdate,
  onAddPrice,
}: {
  item: ShoppingItem;
  categories: ShoppingCategory[];
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
            {categories.map((category) => (
              <button
                key={category.id}
                className={`category-option ${category.id === item.categoryId ? "is-active" : ""}`}
                type="button"
                aria-pressed={category.id === item.categoryId}
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

export const BudgetDialog = ({
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

export const PriceDialog = ({
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

export const BudgetReviewDialog = ({
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

export const ConfirmDialog = ({
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
  const [isConfirming, setConfirming] = useState(false);

  const confirm = async () => {
    if (isConfirming) {
      return;
    }

    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <DialogFrame onClose={() => !isConfirming && onCancel()}>
      <div className="dialog-content">
        <h2 id="dialog-title">{title}</h2>
        <p id="dialog-description">{description}</p>
        <div className="dialog-actions">
          <button
            className="button button-quiet"
            type="button"
            disabled={isConfirming}
            onClick={onCancel}
          >
            {copy.common.cancel}
          </button>
          <button
            className="button button-danger"
            type="button"
            disabled={isConfirming}
            onClick={() => runAsyncAction(confirm())}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
};

export const DialogFrame = ({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) => {
  const dialogReference = useRef<HTMLElement | null>(null);
  useModalFocusTrap(dialogReference, onClose);

  return createPortal(
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={dialogReference}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-description"
      >
        {children}
      </section>
    </div>,
    document.body,
  );
};
