import { useState } from "react";
import {
  AlertTriangle,
  Apple,
  ArchiveRestore,
  Beef,
  Carrot,
  Check,
  ClipboardList,
  Coffee,
  Cookie,
  Copy,
  Egg,
  Fish,
  Heart,
  Milk,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Snowflake,
  SprayCan,
  Tag,
  Trash2,
  Utensils,
  Wallet,
  Wheat,
  type LucideIcon,
} from "lucide-react";

import { useLocalization } from "../../contexts/LocalizationContext/useLocalization";
import type {
  ShoppingCategory,
  ShoppingItem,
  ShoppingListMeta,
  ShoppingSettings,
} from "../../domain/types";
import { formatQuantity } from "../../lib/format";
import {
  getProductPriceStats,
  type BudgetStatus,
  type BudgetSummary,
} from "../../pricing";
import { useShoppingStore } from "../../store/useShoppingStore";
import {
  formatMinorCurrency,
  formatMinorRange,
  getCategory,
  getPriceReferenceUnit,
  groupItems,
  runAsyncAction,
} from "../../utils/shopping";

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

const getCategoryIcon = (categoryId: string): LucideIcon =>
  categoryIcons[categoryId] ?? Package;

export const ShoppingListScreen = ({
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

export const BudgetSummaryBar = ({
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

export const EmptyList = ({ onAddText }: { onAddText: (input: string) => Promise<void> }) => {
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

export const AddItemBar = ({
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

export const CategorySection = ({
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

export const ShoppingItemRow = ({
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
