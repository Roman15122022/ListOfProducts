import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { useLocalization } from "../../contexts/LocalizationContext/useLocalization";
import type { ShoppingItem, ShoppingListMeta } from "../../domain/types";
import type { BudgetSummary } from "../../pricing";
import { groupItems } from "../../utils/shopping";
import { BudgetSummaryBar, CategorySection } from "../ShoppingList";

export const ShoppingMode = ({
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
