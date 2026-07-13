import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ChefHat,
  Clock3,
  ExternalLink,
  Plus,
  Refrigerator,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { useLocalization } from "../../contexts/LocalizationContext/useLocalization";
import {
  type PantryItem,
  type ShoppingCategory,
  type ShoppingItemInput,
} from "../../domain/types";
import { DialogFrame } from "../Dialogs";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import {
  buildRecipeIngredientReview,
  rankRecipesByPantry,
  searchRecipes,
  type RankedRecipe,
  type RecipeIngredientReview,
} from "../../recipes";
import { getCategory, runAsyncAction } from "../../utils/shopping";

type PantryRecipesTab = "pantry" | "recipes";
type RecipeSearchStatus = "idle" | "loading" | "success" | "empty" | "error";

export const PantryRecipesScreen = ({
  pantryItems,
  categories,
  isOnline,
  onAddPantryItems,
  onDeletePantryItem,
  onAddRecipeIngredients,
}: {
  pantryItems: PantryItem[];
  categories: ShoppingCategory[];
  isOnline: boolean;
  onAddPantryItems: (input: string) => Promise<void>;
  onDeletePantryItem: (itemId: string) => Promise<void>;
  onAddRecipeIngredients: (items: ShoppingItemInput[]) => Promise<void>;
}) => {
  const { copy, language } = useLocalization();
  const [activeTab, setActiveTab] = useState<PantryRecipesTab>("pantry");
  const [pantryInput, setPantryInput] = useState("");
  const [isAddingPantryItems, setAddingPantryItems] = useState(false);
  const [selectedPantryItemIds, setSelectedPantryItemIds] = useState<string[]>([]);
  const [searchStatus, setSearchStatus] = useState<RecipeSearchStatus>("idle");
  const [rankedRecipes, setRankedRecipes] = useState<RankedRecipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RankedRecipe | null>(null);
  const searchAbortController = useRef<AbortController | null>(null);
  const ediblePantryItems = useMemo(
    () =>
      pantryItems.filter(
        (item) => item.categoryId !== "household" && item.categoryId !== "hygiene",
      ),
    [pantryItems],
  );
  const selectedPantryItems = ediblePantryItems.filter((item) =>
    selectedPantryItemIds.includes(item.id),
  );
  const selectedPantryItemsKey = selectedPantryItemIds.join("|");
  const groupedPantryItems = useMemo(() => {
    const itemsByCategory = new Map<string, PantryItem[]>();

    for (const item of pantryItems) {
      const categoryItems = itemsByCategory.get(item.categoryId) ?? [];
      categoryItems.push(item);
      itemsByCategory.set(item.categoryId, categoryItems);
    }

    return [...itemsByCategory.entries()]
      .map(([categoryId, items]) => ({
        category:
          categories.find((category) => category.id === categoryId) ??
          getCategory(categoryId, language),
        items,
      }))
      .sort(
        (firstGroup, secondGroup) =>
          firstGroup.category.sortOrder - secondGroup.category.sortOrder,
      );
  }, [categories, language, pantryItems]);

  useEffect(() => {
    setSelectedPantryItemIds((currentIds) => {
      const availableIds = new Set(ediblePantryItems.map((item) => item.id));
      const validIds = currentIds.filter((itemId) => availableIds.has(itemId));

      return validIds.length > 0
        ? validIds.slice(0, 5)
        : ediblePantryItems.slice(0, 5).map((item) => item.id);
    });
  }, [ediblePantryItems]);

  useEffect(() => {
    searchAbortController.current?.abort();
    setRankedRecipes([]);
    setSearchStatus("idle");
  }, [selectedPantryItemsKey]);

  useEffect(
    () => () => {
      searchAbortController.current?.abort();
    },
    [],
  );

  useBodyScrollLock(Boolean(selectedRecipe));

  const submitPantryItems = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!pantryInput.trim() || isAddingPantryItems) {
      return;
    }

    setAddingPantryItems(true);
    try {
      await onAddPantryItems(pantryInput);
      setPantryInput("");
    } finally {
      setAddingPantryItems(false);
    }
  };

  const togglePantrySelection = (itemId: string) => {
    setSelectedPantryItemIds((currentIds) => {
      if (currentIds.includes(itemId)) {
        return currentIds.filter((currentItemId) => currentItemId !== itemId);
      }

      return currentIds.length >= 5 ? currentIds : [...currentIds, itemId];
    });
  };

  const runRecipeSearch = async () => {
    if (selectedPantryItems.length === 0 || searchStatus === "loading") {
      return;
    }

    searchAbortController.current?.abort();
    const abortController = new AbortController();
    searchAbortController.current = abortController;
    setSearchStatus("loading");

    try {
      const recipes = await searchRecipes({
        ingredients: selectedPantryItems.map((item) => item.name),
        signal: abortController.signal,
      });
      const nextRecipes = rankRecipesByPantry(recipes, pantryItems);
      setRankedRecipes(nextRecipes);
      setSearchStatus(nextRecipes.length > 0 ? "success" : "empty");
    } catch {
      if (abortController.signal.aborted) {
        return;
      }

      setRankedRecipes([]);
      setSearchStatus("error");
    }
  };

  return (
    <div className="secondary-screen pantry-recipes-screen">
      <section className="screen-heading panel pantry-recipes-heading">
        <div className="pantry-heading-icon">
          <Refrigerator size={23} />
        </div>
        <div>
          <p className="eyebrow">{copy.pantryRecipes.eyebrow}</p>
          <h1>{copy.pantryRecipes.title}</h1>
          <p>{copy.pantryRecipes.subtitle}</p>
        </div>
      </section>

      <div className="pantry-tabs" role="group" aria-label={copy.pantryRecipes.tabsLabel}>
        <button
          type="button"
          aria-pressed={activeTab === "pantry"}
          className={activeTab === "pantry" ? "is-active" : ""}
          onClick={() => setActiveTab("pantry")}
        >
          <Refrigerator size={17} />
          {copy.pantryRecipes.pantryTab}
          <span>{pantryItems.length}</span>
        </button>
        <button
          type="button"
          aria-pressed={activeTab === "recipes"}
          className={activeTab === "recipes" ? "is-active" : ""}
          onClick={() => setActiveTab("recipes")}
        >
          <ChefHat size={18} />
          {copy.pantryRecipes.recipesTab}
        </button>
      </div>

      {activeTab === "pantry" ? (
        <PantryPanel
          pantryInput={pantryInput}
          pantryItems={pantryItems}
          groupedPantryItems={groupedPantryItems}
          isAdding={isAddingPantryItems}
          onInputChange={setPantryInput}
          onSubmit={submitPantryItems}
          onDelete={onDeletePantryItem}
        />
      ) : (
        <RecipesPanel
          ediblePantryItems={ediblePantryItems}
          selectedPantryItemIds={selectedPantryItemIds}
          isOnline={isOnline}
          searchStatus={searchStatus}
          rankedRecipes={rankedRecipes}
          onToggleSelection={togglePantrySelection}
          onSearch={runRecipeSearch}
          onSelectRecipe={setSelectedRecipe}
        />
      )}

      {selectedRecipe && (
        <RecipeReviewDialog
          rankedRecipe={selectedRecipe}
          pantryItems={pantryItems}
          onClose={() => setSelectedRecipe(null)}
          onAdd={async (items) => {
            await onAddRecipeIngredients(items);
            setSelectedRecipe(null);
          }}
        />
      )}
    </div>
  );
};

const PantryPanel = ({
  pantryInput,
  pantryItems,
  groupedPantryItems,
  isAdding,
  onInputChange,
  onSubmit,
  onDelete,
}: {
  pantryInput: string;
  pantryItems: PantryItem[];
  groupedPantryItems: Array<{ category: ShoppingCategory; items: PantryItem[] }>;
  isAdding: boolean;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: (itemId: string) => Promise<void>;
}) => {
  const { copy, language } = useLocalization();

  return (
    <section className="panel pantry-panel">
      <div className="pantry-section-title">
        <div>
          <p className="eyebrow">{copy.pantryRecipes.pantryCount(pantryItems.length)}</p>
          <h2>{copy.pantryRecipes.pantryTitle}</h2>
          <p>{copy.pantryRecipes.pantryDescription}</p>
        </div>
      </div>
      <form className="pantry-add-form" onSubmit={onSubmit}>
        <label htmlFor="pantry-items-input">{copy.pantryRecipes.addLabel}</label>
        <div className="pantry-add-row">
          <input
            id="pantry-items-input"
            className="field-input"
            value={pantryInput}
            placeholder={copy.pantryRecipes.addPlaceholder}
            autoComplete="off"
            onChange={(event) => onInputChange(event.target.value)}
          />
          <button
            className="button button-primary"
            type="submit"
            disabled={!pantryInput.trim() || isAdding}
          >
            <Plus size={17} />
            {isAdding ? copy.pantryRecipes.adding : copy.pantryRecipes.addAction}
          </button>
        </div>
        <span>{copy.pantryRecipes.addHint}</span>
      </form>

      {pantryItems.length === 0 ? (
        <div className="pantry-empty-state">
          <span><Refrigerator size={27} /></span>
          <h3>{copy.pantryRecipes.emptyPantryTitle}</h3>
          <p>{copy.pantryRecipes.emptyPantryDescription}</p>
        </div>
      ) : (
        <div className="pantry-category-list">
          {groupedPantryItems.map((group) => (
            <section className="pantry-category" key={group.category.id}>
              <div className="pantry-category-heading">
                <h3>
                  {group.category.isDefault
                    ? getCategory(group.category.id, language).name
                    : group.category.name}
                </h3>
                <span>{copy.pantryRecipes.categoryCount(group.items.length)}</span>
              </div>
              <div className="pantry-item-list">
                {group.items.map((item) => (
                  <div className="pantry-item" key={item.id}>
                    <span className="pantry-item-dot" aria-hidden="true" />
                    <strong>{item.name}</strong>
                    <button
                      type="button"
                      aria-label={copy.pantryRecipes.deletePantryItem(item.name)}
                      onClick={() => runAsyncAction(onDelete(item.id))}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
};

const RecipesPanel = ({
  ediblePantryItems,
  selectedPantryItemIds,
  isOnline,
  searchStatus,
  rankedRecipes,
  onToggleSelection,
  onSearch,
  onSelectRecipe,
}: {
  ediblePantryItems: PantryItem[];
  selectedPantryItemIds: string[];
  isOnline: boolean;
  searchStatus: RecipeSearchStatus;
  rankedRecipes: RankedRecipe[];
  onToggleSelection: (itemId: string) => void;
  onSearch: () => Promise<void>;
  onSelectRecipe: (recipe: RankedRecipe) => void;
}) => {
  const { copy } = useLocalization();

  return (
    <div className="recipes-workspace">
      <section className="panel recipe-search-panel">
        <div className="pantry-section-title">
          <div>
            <p className="eyebrow">{copy.pantryRecipes.selectedCount(selectedPantryItemIds.length)}</p>
            <h2>{copy.pantryRecipes.recipesTitle}</h2>
            <p>{copy.pantryRecipes.recipesDescription}</p>
          </div>
          <ChefHat size={27} />
        </div>

        {ediblePantryItems.length === 0 ? (
          <InlineState
            icon={<Refrigerator size={24} />}
            title={copy.pantryRecipes.noEdibleTitle}
            description={copy.pantryRecipes.noEdibleDescription}
          />
        ) : (
          <>
            <div className="recipe-filter-block">
              <div className="recipe-filter-heading">
                <strong>{copy.pantryRecipes.chooseIngredients}</strong>
                <span>{copy.pantryRecipes.chooseIngredientsHint}</span>
              </div>
              <div
                className="recipe-choice-chips"
                role="group"
                aria-label={copy.pantryRecipes.chooseIngredients}
              >
                {ediblePantryItems.map((item) => {
                  const isSelected = selectedPantryItemIds.includes(item.id);
                  const isDisabled = !isSelected && selectedPantryItemIds.length >= 5;

                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={isSelected ? "is-selected" : ""}
                      aria-pressed={isSelected}
                      disabled={isDisabled}
                      onClick={() => onToggleSelection(item.id)}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
              {selectedPantryItemIds.length >= 5 && (
                <span className="recipe-selection-hint">{copy.pantryRecipes.selectionLimit}</span>
              )}
            </div>

            <button
              className="button button-primary recipe-search-button"
              type="button"
              disabled={
                selectedPantryItemIds.length === 0 ||
                searchStatus === "loading"
              }
              onClick={() => runAsyncAction(onSearch())}
            >
              <Search size={18} />
              {searchStatus === "loading" ? copy.pantryRecipes.searching : copy.pantryRecipes.search}
            </button>
          </>
        )}
      </section>

      {ediblePantryItems.length > 0 && (
        <section className="recipe-results-section" aria-live="polite">
          {searchStatus === "loading" ? (
            <RecipeSkeletons label={copy.pantryRecipes.searching} />
          ) : searchStatus === "empty" ? (
            <InlineState
              icon={<ChefHat size={24} />}
              title={copy.pantryRecipes.emptyRecipesTitle}
              description={copy.pantryRecipes.emptyRecipesDescription}
            />
          ) : searchStatus === "error" ? (
            <InlineState
              icon={<AlertCircle size={24} />}
              title={isOnline ? copy.pantryRecipes.errorTitle : copy.pantryRecipes.offlineTitle}
              description={
                isOnline
                  ? copy.pantryRecipes.errorDescription
                  : copy.pantryRecipes.offlineDescription
              }
              actionLabel={copy.pantryRecipes.retry}
              onAction={onSearch}
            />
          ) : searchStatus === "success" ? (
            <>
              <div className="recipe-results-heading">
                <h2>{copy.pantryRecipes.recipesFound(rankedRecipes.length)}</h2>
              </div>
              <div className="recipe-grid">
                {rankedRecipes.map((rankedRecipe) => (
                  <RecipeCard
                    key={rankedRecipe.recipe.uri}
                    rankedRecipe={rankedRecipe}
                    onOpen={() => onSelectRecipe(rankedRecipe)}
                  />
                ))}
              </div>
            </>
          ) : !isOnline ? (
            <InlineState
              icon={<AlertCircle size={24} />}
              title={copy.pantryRecipes.offlineTitle}
              description={copy.pantryRecipes.offlineDescription}
            />
          ) : (
            <InlineState
              icon={<ChefHat size={24} />}
              title={copy.pantryRecipes.idleTitle}
              description={copy.pantryRecipes.idleDescription}
            />
          )}
        </section>
      )}
    </div>
  );
};

const RecipeCard = ({
  rankedRecipe,
  onOpen,
}: {
  rankedRecipe: RankedRecipe;
  onOpen: () => void;
}) => {
  const { copy, language } = useLocalization();
  const { recipe } = rankedRecipe;

  return (
    <article className="panel recipe-card">
      <div className="recipe-card-image">
        {recipe.image ? (
          <img
            src={recipe.image}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <ChefHat size={32} />
        )}
        <span>{copy.pantryRecipes.coverage(Math.round(rankedRecipe.coverage * 100))}</span>
      </div>
      <div className="recipe-card-body">
        <span className="eyebrow">{recipe.source}</span>
        <h3 lang={language === "uk" ? "en" : undefined}>{recipe.label}</h3>
        <p>
          {copy.pantryRecipes.matchSummary(
            rankedRecipe.matchedIngredientCount,
            rankedRecipe.missingIngredientCount,
          )}
        </p>
        <div className="recipe-card-meta">
          {recipe.totalTime > 0 && (
            <span>
              <Clock3 size={15} />
              {copy.pantryRecipes.minutes(recipe.totalTime)}
            </span>
          )}
          {recipe.yield > 0 && (
            <span>
              <Users size={15} />
              {copy.pantryRecipes.servings(recipe.yield)}
            </span>
          )}
        </div>
        <button className="button button-secondary" type="button" onClick={onOpen}>
          {copy.pantryRecipes.viewRecipe}
        </button>
      </div>
    </article>
  );
};

const RecipeReviewDialog = ({
  rankedRecipe,
  pantryItems,
  onClose,
  onAdd,
}: {
  rankedRecipe: RankedRecipe;
  pantryItems: PantryItem[];
  onClose: () => void;
  onAdd: (items: ShoppingItemInput[]) => Promise<void>;
}) => {
  const { copy, language } = useLocalization();
  const reviews = useMemo(
    () => buildRecipeIngredientReview(rankedRecipe.recipe, pantryItems),
    [pantryItems, rankedRecipe.recipe],
  );
  const [selectedCanonicalNames, setSelectedCanonicalNames] = useState<string[]>(
    reviews.filter((review) => review.isMissing).map((review) => review.canonicalName),
  );
  const [isAdding, setAdding] = useState(false);
  const selectedReviews = reviews.filter((review) =>
    selectedCanonicalNames.includes(review.canonicalName),
  );

  const addSelectedItems = async () => {
    if (selectedReviews.length === 0 || isAdding) {
      return;
    }

    setAdding(true);
    try {
      await onAdd(
        selectedReviews.map((review) => ({
          name: review.name,
          quantity: review.quantity,
          unit: review.unit,
        })),
      );
    } finally {
      setAdding(false);
    }
  };

  return (
    <DialogFrame onClose={onClose}>
      <div className="dialog-content recipe-review-dialog">
        <div className="recipe-review-header">
          <div>
            <p className="eyebrow">{rankedRecipe.recipe.source}</p>
            <h2 id="dialog-title" lang={language === "uk" ? "en" : undefined}>
              {rankedRecipe.recipe.label}
            </h2>
            <p id="dialog-description">{copy.pantryRecipes.ingredientsDescription}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={copy.pantryRecipes.closeRecipe}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="recipe-review-list">
          {reviews.map((review) => (
            <RecipeReviewItem
              key={review.canonicalName}
              review={review}
              checked={selectedCanonicalNames.includes(review.canonicalName)}
              onToggle={() =>
                setSelectedCanonicalNames((currentNames) =>
                  currentNames.includes(review.canonicalName)
                    ? currentNames.filter((name) => name !== review.canonicalName)
                    : [...currentNames, review.canonicalName],
                )
              }
            />
          ))}
        </div>
        <a
          className="recipe-source-link"
          href={rankedRecipe.recipe.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={copy.pantryRecipes.sourceRecipeNewTab}
        >
          <ExternalLink size={16} />
          {copy.pantryRecipes.sourceRecipe}
        </a>
        {reviews.every((review) => !review.isMissing) && (
          <p className="recipe-import-note">{copy.pantryRecipes.nothingMissing}</p>
        )}
        <div className="dialog-actions">
          <button className="button button-quiet" type="button" onClick={onClose}>
            {copy.common.cancel}
          </button>
          <button
            className="button button-primary"
            type="button"
            disabled={selectedReviews.length === 0 || isAdding}
            onClick={() => runAsyncAction(addSelectedItems())}
          >
            <Plus size={17} />
            {isAdding
              ? copy.pantryRecipes.addingSelected
              : copy.pantryRecipes.addSelected(selectedReviews.length)}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
};

const RecipeReviewItem = ({
  review,
  checked,
  onToggle,
}: {
  review: RecipeIngredientReview;
  checked: boolean;
  onToggle: () => void;
}) => {
  const { copy } = useLocalization();

  return (
    <label className={`recipe-review-item ${review.isMissing ? "is-missing" : "is-available"}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="recipe-review-check" aria-hidden="true" />
      <span>
        <strong>{review.sourceText || review.name}</strong>
        <small>{review.isMissing ? copy.pantryRecipes.missing : copy.pantryRecipes.available}</small>
      </span>
    </label>
  );
};

const InlineState = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => Promise<void>;
}) => (
  <div className="panel recipe-inline-state">
    <span>{icon}</span>
    <h3>{title}</h3>
    <p>{description}</p>
    {actionLabel && onAction && (
      <button
        className="button button-secondary"
        type="button"
        onClick={() => runAsyncAction(onAction())}
      >
        {actionLabel}
      </button>
    )}
  </div>
);

const RecipeSkeletons = ({ label }: { label: string }) => (
  <div className="recipe-grid" role="status" aria-label={label}>
    {[0, 1, 2].map((index) => (
      <div className="panel recipe-card recipe-card-skeleton" aria-hidden="true" key={index}>
        <div className="recipe-card-image" />
        <div className="recipe-card-body">
          <span />
          <strong />
          <p />
        </div>
      </div>
    ))}
  </div>
);
