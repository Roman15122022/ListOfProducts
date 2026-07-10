import type { AppLanguage, ShoppingTemplate } from "../domain/types";
import { normalizeProductName } from "./parseShoppingInput";

export type DisplayLanguage = "en" | "uk";
export type NavigationKey = "list" | "suggestions" | "templates" | "history" | "settings";

export type AppCopy = {
  navigation: Record<NavigationKey, string>;
  common: {
    cancel: string;
    add: string;
    save: string;
    remove: string;
    skip: string;
    clear: string;
    undo: string;
    items: string;
    offline: string;
  };
  app: {
    brandTagline: string;
    brandName: string;
    documentTitle: string;
    documentDescription: string;
    loadingTitle: string;
    loadingDescription: string;
    errorTitle: string;
    errorDescription: string;
    retry: string;
    primaryNavigation: string;
    localData: string;
    openShoppingMode: string;
    shoppingMode: string;
    openSettings: string;
  };
  list: {
    today: string;
    title: string;
    subtitle: string;
    done: string;
    progress: (boughtCount: number, totalCount: number) => string;
    progressAria: (progress: number) => string;
    copyList: string;
    clearPurchased: string;
    clearList: string;
    emptyTitle: string;
    emptyDescription: string;
    quickAdd: string;
    addItems: string;
    moveBack: (name: string) => string;
    markPurchased: (name: string) => string;
    changeCategory: (name: string) => string;
    deleteItem: (name: string) => string;
  };
  suggestions: {
    eyebrow: string;
    title: string;
    subtitle: string;
    disabledTitle: string;
    disabledDescription: string;
    openSettings: string;
    frequentEyebrow: string;
    frequentTitle: string;
    frequentDescription: string;
    starterEyebrow: string;
    starterTitle: string;
    starterDescription: string;
    addToList: string;
    readyEyebrow: string;
    readyDescription: string;
    addSet: string;
    rhythmEyebrow: string;
    rhythmTitle: string;
    rhythmDescription: string;
  };
  templates: {
    eyebrow: string;
    title: string;
    subtitle: string;
    addItems: string;
  };
  history: {
    eyebrow: string;
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyDescription: string;
    count: (count: number) => string;
    listAt: (time: string) => string;
    recordedTotal: (total: string, pricedCount: number, totalCount: number) => string;
  };
  settings: {
    eyebrow: string;
    title: string;
    subtitle: string;
    appearance: string;
    language: string;
    languageDescription: string;
    currency: string;
    currencyDescription: string;
    theme: string;
    themeDescription: string;
    hidePurchased: string;
    hidePurchasedDescription: string;
    groupByCategory: string;
    groupByCategoryDescription: string;
    suggestions: string;
    showIdeas: string;
    showIdeasDescription: string;
    data: string;
    installApp: string;
    installAvailable: string;
    installUnavailable: string;
    install: string;
    exportData: string;
    exportDescription: string;
    export: string;
    importData: string;
    importDescription: string;
    import: string;
    clearData: string;
    clearDataDescription: string;
    themeLabel: string;
    system: string;
    light: string;
    dark: string;
  };
  mode: {
    eyebrow: string;
    title: string;
    hidePurchased: string;
    showPurchased: string;
    close: string;
    purchased: string;
    allPurchasedTitle: string;
    emptyTitle: string;
    allPurchasedDescription: string;
    emptyDescription: string;
  };
  categoryDialog: {
    title: string;
    description: (name: string) => string;
    categoryTitle: string;
    optional: string;
    optionalDescription: string;
    priceHistory: string;
    noPriceHistory: string;
  };
  budget: {
    addBudget: string;
    editBudget: string;
    expected: string;
    budget: string;
    coverage: (pricedCount: number, totalCount: number) => string;
    noPrices: string;
    within: string;
    risk: string;
    over: string;
    partial: string;
    review: string;
    dialogTitle: string;
    dialogDescription: string;
    amountLabel: string;
    removeBudget: string;
    reviewTitle: string;
    reviewDescription: string;
    optionalItems: string;
    noOptionalItems: string;
    removeOptional: (count: number) => string;
    reduceQuantities: string;
    reduceHint: string;
    applyQuantities: string;
    remaining: string;
  };
  price: {
    addPrice: string;
    addPriceFor: (name: string) => string;
    editPriceFor: (name: string) => string;
    dialogTitle: (name: string) => string;
    dialogDescription: string;
    priceLabel: string;
    packageQuantity: string;
    packageUnit: string;
    last: string;
    average: string;
    change: string;
  };
  toasts: {
    itemAdded: (name: string) => string;
    itemsAdded: (count: number) => string;
    itemDeleted: (name: string) => string;
    templateAdded: (name: string) => string;
    noActiveItems: string;
    listCopied: string;
    copyFailed: string;
    backupReady: string;
    dataRestored: string;
    importFailed: string;
    dataCleared: string;
    listCleared: string;
    installFromBrowser: string;
    appInstalled: string;
    categoryUpdated: string;
    purchased: (name: string) => string;
    priceSaved: string;
    budgetSaved: string;
    budgetRemoved: string;
    optionalRemoved: (count: number) => string;
    quantitiesUpdated: string;
    operationFailed: string;
  };
  confirms: {
    clearListTitle: string;
    clearListDescription: string;
    clearListConfirm: string;
    clearDataTitle: string;
    clearDataDescription: string;
    clearDataConfirm: string;
  };
  quickProducts: string[];
  categories: Record<string, string>;
};

const englishCopy: AppCopy = {
  navigation: {
    list: "List",
    suggestions: "Ideas",
    templates: "Templates",
    history: "History",
    settings: "More",
  },
  common: {
    cancel: "Cancel",
    add: "Add",
    save: "Save",
    remove: "Remove",
    skip: "Skip",
    clear: "Clear",
    undo: "Undo",
    items: "items",
    offline: "Offline",
  },
  app: {
    brandTagline: "Smart shopping",
    brandName: "Shopping list",
    documentTitle: "Smart Shopping List",
    documentDescription: "A fast, offline-ready shopping list.",
    loadingTitle: "Opening your list",
    loadingDescription: "Preparing your local data. This only takes a moment.",
    errorTitle: "Your list could not be opened",
    errorDescription: "Your local data is still safe. Try opening the list again.",
    retry: "Try again",
    primaryNavigation: "Primary navigation",
    localData: "All data stays on this device.",
    openShoppingMode: "Open shopping mode",
    shoppingMode: "Shopping mode",
    openSettings: "Open settings",
  },
  list: {
    today: "Today",
    title: "Shopping without the noise",
    subtitle: "Add a whole line, and your list will sort the items into categories for you.",
    done: "Done",
    progress: (boughtCount, totalCount) => `${boughtCount} of ${totalCount}`,
    progressAria: (progress) => `${progress}% purchased`,
    copyList: "Copy list",
    clearPurchased: "Clear purchased",
    clearList: "Clear list",
    emptyTitle: "Your list is ready",
    emptyDescription: "Write several items separated by commas, or start with a staple.",
    quickAdd: "Quick add",
    addItems: "Add items",
    moveBack: (name) => `Move ${name} back to the list`,
    markPurchased: (name) => `Mark ${name} as purchased`,
    changeCategory: (name) => `Change category for ${name}`,
    deleteItem: (name) => `Delete ${name}`,
  },
  suggestions: {
    eyebrow: "On request",
    title: "Helpful ideas",
    subtitle: "Nothing is added automatically. You choose what you actually need.",
    disabledTitle: "Suggestions are off",
    disabledDescription: "Your main list still works as usual. Turn ideas on whenever you want.",
    openSettings: "Open settings",
    frequentEyebrow: "Frequently bought",
    frequentTitle: "You may need these",
    frequentDescription: "This is based on completed purchases and stays on your device.",
    starterEyebrow: "Easy start",
    starterTitle: "Everyday essentials",
    starterDescription: "A few common items to help start a new list.",
    addToList: "Add to list",
    readyEyebrow: "Ready-to-use list",
    readyDescription: "Add this set now, or choose another one in Templates.",
    addSet: "Add set",
    rhythmEyebrow: "Shopping rhythm",
    rhythmTitle: "Personal reminders will appear here",
    rhythmDescription: "After a few trips, the app can quietly suggest familiar items when the time is right.",
  },
  templates: {
    eyebrow: "Ready-to-use lists",
    title: "Shopping templates",
    subtitle: "Add a familiar set of items in one tap.",
    addItems: "Add items",
  },
  history: {
    eyebrow: "Your rhythm",
    title: "Purchase history",
    subtitle: "Completed purchases help identify only the items you frequently buy.",
    emptyTitle: "Your history will appear here",
    emptyDescription: "Mark items as purchased to keep a useful local history.",
    count: (count) => `${count} ${count === 1 ? "item" : "items"}`,
    listAt: (time) => `List at ${time}`,
    recordedTotal: (total, pricedCount, totalCount) =>
      `${total} recorded · prices for ${pricedCount} of ${totalCount}`,
  },
  settings: {
    eyebrow: "Only on your device",
    title: "Settings",
    subtitle: "Your list works without an account or sending purchases to a server.",
    appearance: "Appearance",
    language: "Language",
    languageDescription: "Use English or Ukrainian across the app",
    currency: "Currency",
    currencyDescription: "Used for budgets and personal prices",
    theme: "Theme",
    themeDescription: "Light, dark, or your device preference",
    hidePurchased: "Hide purchased",
    hidePurchasedDescription: "They will stay in your history",
    groupByCategory: "Group by category",
    groupByCategoryDescription: "Produce, dairy, meat, and more",
    suggestions: "Quiet suggestions",
    showIdeas: "Show ideas",
    showIdeasDescription: "Only in the Ideas tab, never added automatically",
    data: "Data",
    installApp: "Install app",
    installAvailable: "Add a shortcut to your home screen",
    installUnavailable: "Available from your browser menu",
    install: "Install",
    exportData: "Export data",
    exportDescription: "A JSON file with your list, history, and templates",
    export: "Export",
    importData: "Import data",
    importDescription: "Restore a saved backup",
    import: "Import",
    clearData: "Clear data",
    clearDataDescription: "Remove the list and history from this device",
    themeLabel: "Theme",
    system: "System",
    light: "Light",
    dark: "Dark",
  },
  mode: {
    eyebrow: "Focused shopping",
    title: "Shopping mode",
    hidePurchased: "Hide purchased",
    showPurchased: "Show purchased",
    close: "Close shopping mode",
    purchased: "Purchased",
    allPurchasedTitle: "Everything is purchased",
    emptyTitle: "Your list is empty",
    allPurchasedDescription: "You are all set.",
    emptyDescription: "Add items in the regular list first.",
  },
  categoryDialog: {
    title: "Item details",
    description: (name) => `Settings and personal price history for “${name}”.`,
    categoryTitle: "Category",
    optional: "Can skip",
    optionalDescription: "Budget review may suggest removing this item",
    priceHistory: "Personal price history",
    noPriceHistory: "Add an actual price after a purchase to see the history here.",
  },
  budget: {
    addBudget: "Add budget",
    editBudget: "Edit budget",
    expected: "Expected",
    budget: "Budget",
    coverage: (pricedCount, totalCount) => `Estimated ${pricedCount} of ${totalCount}`,
    noPrices: "Add purchase prices to estimate this list",
    within: "Within budget",
    risk: "May exceed budget",
    over: "Over budget",
    partial: "Partial estimate",
    review: "Review",
    dialogTitle: "List budget",
    dialogDescription: "Optional for this list only. It never blocks your shopping.",
    amountLabel: "Budget amount",
    removeBudget: "Remove budget",
    reviewTitle: "Review budget",
    reviewDescription: "Nothing changes until you confirm it.",
    optionalItems: "Optional items",
    noOptionalItems: "Mark items as optional in item details to review them here.",
    removeOptional: (count) => `Remove ${count} optional ${count === 1 ? "item" : "items"}`,
    reduceQuantities: "Reduce quantities",
    reduceHint: "Choose smaller quantities and check the new estimate before applying.",
    applyQuantities: "Apply quantities",
    remaining: "Budget remaining",
  },
  price: {
    addPrice: "Add price",
    addPriceFor: (name) => `Add price for ${name}`,
    editPriceFor: (name) => `Edit price for ${name}`,
    dialogTitle: (name) => `Price for ${name}`,
    dialogDescription: "Optional. Enter the shelf price and its package size.",
    priceLabel: "Price",
    packageQuantity: "Package size",
    packageUnit: "Unit",
    last: "Last price",
    average: "Average",
    change: "Change",
  },
  toasts: {
    itemAdded: (name) => `${name} added to the list`,
    itemsAdded: (count) => `Added ${count} items`,
    itemDeleted: (name) => `${name} deleted`,
    templateAdded: (name) => `“${name}” added to the list`,
    noActiveItems: "Your list has no active items yet",
    listCopied: "List copied",
    copyFailed: "Could not copy the list",
    backupReady: "Backup ready",
    dataRestored: "Data restored",
    importFailed: "Could not read this file",
    dataCleared: "Local data cleared",
    listCleared: "List cleared",
    installFromBrowser: "Install the app from your browser menu",
    appInstalled: "App added to your device",
    categoryUpdated: "Category updated",
    purchased: (name) => `${name} purchased`,
    priceSaved: "Price saved",
    budgetSaved: "Budget saved",
    budgetRemoved: "Budget removed",
    optionalRemoved: (count) => `Removed ${count} optional ${count === 1 ? "item" : "items"}`,
    quantitiesUpdated: "Quantities updated",
    operationFailed: "Could not save the change. Please try again.",
  },
  confirms: {
    clearListTitle: "Clear this list?",
    clearListDescription: "All current items will be removed. Your history and templates will stay saved.",
    clearListConfirm: "Clear list",
    clearDataTitle: "Clear all data?",
    clearDataDescription: "Your list, history, and personal settings will be deleted from this device only.",
    clearDataConfirm: "Clear",
  },
  quickProducts: ["Milk 2 L", "Bread", "Eggs 10", "Chicken 1 kg"],
  categories: {
    vegetables: "Vegetables",
    fruits: "Fruits",
    dairy: "Dairy",
    eggs: "Eggs",
    meat: "Meat",
    fish: "Fish",
    grains: "Grains",
    pasta: "Pasta",
    bread: "Bread",
    drinks: "Drinks",
    sweets: "Sweets",
    frozen: "Frozen",
    canned: "Canned",
    household: "Household",
    hygiene: "Personal Care",
    other: "Other",
    all: "All items",
  },
};

const ukrainianCopy: AppCopy = {
  navigation: {
    list: "Список",
    suggestions: "Ідеї",
    templates: "Шаблони",
    history: "Історія",
    settings: "Ще",
  },
  common: {
    cancel: "Скасувати",
    add: "Додати",
    save: "Зберегти",
    remove: "Видалити",
    skip: "Пропустити",
    clear: "Очистити",
    undo: "Повернути",
    items: "позицій",
    offline: "Офлайн",
  },
  app: {
    brandTagline: "Розумні покупки",
    brandName: "Список покупок",
    documentTitle: "Розумний список покупок",
    documentDescription: "Швидкий список покупок, який працює без інтернету.",
    loadingTitle: "Відкриваємо ваш список",
    loadingDescription: "Готуємо локальні дані. Це займе лише мить.",
    errorTitle: "Не вдалося відкрити список",
    errorDescription: "Локальні дані залишилися на пристрої. Спробуйте відкрити список ще раз.",
    retry: "Спробувати ще раз",
    primaryNavigation: "Основна навігація",
    localData: "Усі дані залишаються на цьому пристрої.",
    openShoppingMode: "Відкрити режим магазину",
    shoppingMode: "Режим магазину",
    openSettings: "Відкрити налаштування",
  },
  list: {
    today: "Сьогодні",
    title: "Покупки без зайвого",
    subtitle: "Додавайте кілька позицій одним рядком — список сам розкладе їх за категоріями.",
    done: "Готово",
    progress: (boughtCount, totalCount) => `${boughtCount} з ${totalCount}`,
    progressAria: (progress) => `Куплено ${progress}%`,
    copyList: "Скопіювати",
    clearPurchased: "Прибрати куплені",
    clearList: "Очистити список",
    emptyTitle: "Список готовий",
    emptyDescription: "Введіть кілька позицій через кому або почніть зі звичного товару.",
    quickAdd: "Швидке додавання",
    addItems: "Додати товари",
    moveBack: (name) => `Повернути ${name} до списку`,
    markPurchased: (name) => `Позначити ${name} купленим`,
    changeCategory: (name) => `Змінити категорію для ${name}`,
    deleteItem: (name) => `Видалити ${name}`,
  },
  suggestions: {
    eyebrow: "Лише за запитом",
    title: "Корисні ідеї",
    subtitle: "Нічого не додається автоматично. Ви обираєте лише потрібне.",
    disabledTitle: "Підказки вимкнені",
    disabledDescription: "Основний список працює як завжди. Увімкніть ідеї, коли захочете.",
    openSettings: "Відкрити налаштування",
    frequentEyebrow: "Купуєте часто",
    frequentTitle: "Може знадобитися",
    frequentDescription: "Добірка базується на завершених покупках і зберігається лише на пристрої.",
    starterEyebrow: "Легкий старт",
    starterTitle: "Базові товари",
    starterDescription: "Кілька звичних позицій, з яких зручно почати новий список.",
    addToList: "Додати до списку",
    readyEyebrow: "Готовий набір",
    readyDescription: "Додайте цей набір або виберіть інший на вкладці «Шаблони».",
    addSet: "Додати набір",
    rhythmEyebrow: "Ритм покупок",
    rhythmTitle: "Тут з’являться точні нагадування",
    rhythmDescription: "Після кількох покупок застосунок зможе спокійно підказати звичні товари в потрібний час.",
  },
  templates: {
    eyebrow: "Готові набори",
    title: "Шаблони покупок",
    subtitle: "Додавайте звичний набір товарів однією дією.",
    addItems: "Додати товари",
  },
  history: {
    eyebrow: "Ваш ритм",
    title: "Історія покупок",
    subtitle: "Завершені покупки допомагають підказувати лише те, що ви купуєте часто.",
    emptyTitle: "Історія з’явиться тут",
    emptyDescription: "Позначайте товари купленими, щоб зберігати зручну локальну історію.",
    listAt: (time) => `Список о ${time}`,
    recordedTotal: (total, pricedCount, totalCount) =>
      `${total} записано · ціни для ${pricedCount} з ${totalCount}`,
    count: (count) => {
      const lastTwoDigits = count % 100;
      const lastDigit = count % 10;

      if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
        return `${count} позицій`;
      }

      if (lastDigit === 1) {
        return `${count} позиція`;
      }

      if (lastDigit >= 2 && lastDigit <= 4) {
        return `${count} позиції`;
      }

      return `${count} позицій`;
    },
  },
  settings: {
    eyebrow: "Лише на вашому пристрої",
    title: "Налаштування",
    subtitle: "Список працює без акаунта й без передачі покупок на сервер.",
    appearance: "Вигляд",
    language: "Мова",
    languageDescription: "Англійська або українська для всього застосунку",
    currency: "Валюта",
    currencyDescription: "Для бюджету та особистих цін",
    theme: "Тема",
    themeDescription: "Світла, темна або як на пристрої",
    hidePurchased: "Приховувати куплені",
    hidePurchasedDescription: "Вони залишаться в історії",
    groupByCategory: "Групувати за категоріями",
    groupByCategoryDescription: "Овочі, молочне, м’ясо та інше",
    suggestions: "Ненав’язливі підказки",
    showIdeas: "Показувати ідеї",
    showIdeasDescription: "Лише на вкладці «Ідеї», без автододавання",
    data: "Дані",
    installApp: "Встановити застосунок",
    installAvailable: "Додайте швидкий доступ на головний екран",
    installUnavailable: "Доступно через меню браузера",
    install: "Встановити",
    exportData: "Експортувати дані",
    exportDescription: "JSON-файл зі списком, історією та шаблонами",
    export: "Експорт",
    importData: "Імпортувати дані",
    importDescription: "Відновити збережену копію",
    import: "Імпорт",
    clearData: "Очистити дані",
    clearDataDescription: "Видалити список та історію з пристрою",
    themeLabel: "Тема",
    system: "Система",
    light: "Світла",
    dark: "Темна",
  },
  mode: {
    eyebrow: "Фокус на покупках",
    title: "Режим магазину",
    hidePurchased: "Сховати куплені",
    showPurchased: "Показати куплені",
    close: "Закрити режим магазину",
    purchased: "Куплено",
    allPurchasedTitle: "Усе куплено",
    emptyTitle: "Список порожній",
    allPurchasedDescription: "Усе готово.",
    emptyDescription: "Спочатку додайте товари у звичайному списку.",
  },
  categoryDialog: {
    title: "Деталі товару",
    description: (name) => `Налаштування та особиста історія цін для «${name}».`,
    categoryTitle: "Категорія",
    optional: "Можна не купувати",
    optionalDescription: "Під час перегляду бюджету застосунок може запропонувати прибрати цей товар",
    priceHistory: "Особиста історія цін",
    noPriceHistory: "Додайте фактичну ціну після покупки, щоб побачити історію.",
  },
  budget: {
    addBudget: "Додати бюджет",
    editBudget: "Змінити бюджет",
    expected: "Очікується",
    budget: "Бюджет",
    coverage: (pricedCount, totalCount) => `Оцінено ${pricedCount} з ${totalCount}`,
    noPrices: "Додавайте ціни покупок, щоб оцінити цей список",
    within: "У межах бюджету",
    risk: "Можливе перевищення",
    over: "Бюджет перевищено",
    partial: "Часткова оцінка",
    review: "Переглянути",
    dialogTitle: "Бюджет списку",
    dialogDescription: "Необов’язково й лише для цього списку. Бюджет не блокує покупки.",
    amountLabel: "Сума бюджету",
    removeBudget: "Прибрати бюджет",
    reviewTitle: "Перегляд бюджету",
    reviewDescription: "Нічого не зміниться без вашого підтвердження.",
    optionalItems: "Необов’язкові товари",
    noOptionalItems: "Позначте товари необов’язковими в деталях, щоб побачити їх тут.",
    removeOptional: (count) => `Прибрати необов’язкові: ${count}`,
    reduceQuantities: "Зменшити кількість",
    reduceHint: "Оберіть меншу кількість і перевірте нову оцінку перед застосуванням.",
    applyQuantities: "Застосувати кількість",
    remaining: "Залишок бюджету",
  },
  price: {
    addPrice: "Додати ціну",
    addPriceFor: (name) => `Додати ціну для ${name}`,
    editPriceFor: (name) => `Змінити ціну для ${name}`,
    dialogTitle: (name) => `Ціна для ${name}`,
    dialogDescription: "Необов’язково. Вкажіть ціну з цінника та розмір упаковки.",
    priceLabel: "Ціна",
    packageQuantity: "Розмір упаковки",
    packageUnit: "Одиниця",
    last: "Остання ціна",
    average: "Середня",
    change: "Зміна",
  },
  toasts: {
    itemAdded: (name) => `${name} додано до списку`,
    itemsAdded: (count) => `Додано позицій: ${count}`,
    itemDeleted: (name) => `${name} видалено`,
    templateAdded: (name) => `«${name}» додано до списку`,
    noActiveItems: "У списку ще немає активних покупок",
    listCopied: "Список скопійовано",
    copyFailed: "Не вдалося скопіювати список",
    backupReady: "Резервна копія готова",
    dataRestored: "Дані відновлено",
    importFailed: "Не вдалося прочитати цей файл",
    dataCleared: "Локальні дані очищено",
    listCleared: "Список очищено",
    installFromBrowser: "Встановіть застосунок через меню браузера",
    appInstalled: "Застосунок додано на пристрій",
    categoryUpdated: "Категорію оновлено",
    purchased: (name) => `${name} куплено`,
    priceSaved: "Ціну збережено",
    budgetSaved: "Бюджет збережено",
    budgetRemoved: "Бюджет прибрано",
    optionalRemoved: (count) => `Прибрано необов’язкових товарів: ${count}`,
    quantitiesUpdated: "Кількість оновлено",
    operationFailed: "Не вдалося зберегти зміну. Спробуйте ще раз.",
  },
  confirms: {
    clearListTitle: "Очистити цей список?",
    clearListDescription: "Усі поточні товари буде видалено. Історія та шаблони залишаться збереженими.",
    clearListConfirm: "Очистити список",
    clearDataTitle: "Очистити всі дані?",
    clearDataDescription: "Список, історію та персональні налаштування буде видалено лише з цього пристрою.",
    clearDataConfirm: "Очистити",
  },
  quickProducts: ["Молоко 2 л", "Хліб", "Яйця 10", "Курка 1 кг"],
  categories: {
    vegetables: "Овочі",
    fruits: "Фрукти",
    dairy: "Молочне",
    eggs: "Яйця",
    meat: "М’ясо",
    fish: "Риба",
    grains: "Крупи",
    pasta: "Макарони",
    bread: "Хліб",
    drinks: "Напої",
    sweets: "Солодке",
    frozen: "Заморозка",
    canned: "Консерви",
    household: "Побутова хімія",
    hygiene: "Гігієна",
    other: "Інше",
    all: "Усі покупки",
  },
};

const localizedStarterTemplates: Record<DisplayLanguage, Record<string, { name: string; items: string[] }>> = {
  en: {},
  uk: {
    "starter-weekly": {
      name: "Щотижневі покупки",
      items: ["Молоко", "Хліб", "Яйця", "Яблука", "Картопля"],
    },
    "starter-breakfast": {
      name: "Сніданок",
      items: ["Яйця", "Хліб", "Сир", "Молоко", "Вівсянка", "Кава"],
    },
    "starter-borscht": {
      name: "Борщ",
      items: ["Буряк", "Капуста", "Картопля", "Морква", "Цибуля", "М’ясо", "Томатна паста", "Сметана"],
    },
    "starter-gym": {
      name: "Для тренувань",
      items: ["Банани", "Сир кисломолочний", "Курка", "Рис", "Вода"],
    },
    "starter-cleaning": {
      name: "Прибирання",
      items: ["Пральний засіб", "Засіб для посуду", "Губки", "Туалетний папір"],
    },
    "starter-quick-dinner": {
      name: "Швидка вечеря",
      items: ["Макарони", "Курка", "Помідори", "Сир"],
    },
  },
};

export const resolveDisplayLanguage = (language?: AppLanguage): DisplayLanguage =>
  language === "uk" ? "uk" : "en";

export const getAppCopy = (language?: AppLanguage): AppCopy =>
  resolveDisplayLanguage(language) === "uk" ? ukrainianCopy : englishCopy;

export const getLocalizedCategoryName = (
  categoryId: string,
  fallbackName: string,
  language?: AppLanguage,
): string => getAppCopy(language).categories[categoryId] ?? fallbackName;

export const getLocalizedStarterTemplate = (
  template: ShoppingTemplate,
  language?: AppLanguage,
): ShoppingTemplate => {
  const localizedTemplate = localizedStarterTemplates[resolveDisplayLanguage(language)][template.id];

  if (!localizedTemplate) {
    return template;
  }

  return {
    ...template,
    name: localizedTemplate.name,
    items: template.items.map((item, index) => {
      const localizedName = localizedTemplate.items[index] ?? item.name;

      return {
        ...item,
        name: localizedName,
        normalizedName: normalizeProductName(localizedName),
      };
    }),
  };
};
