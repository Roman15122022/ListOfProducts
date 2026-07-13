# Smart Shopping List

Мобильный React/PWA-список покупок с локальным хранением данных, историей покупок,
бюджетом, ценами, продуктами дома, шаблонами и поиском рецептов. Приложение работает
без собственного backend: основные пользовательские данные сохраняются в IndexedDB на
текущем устройстве.

## Возможности

- добавление нескольких товаров одной строкой с распознаванием количества и единиц;
- категории, обязательные и необязательные позиции, режим покупок;
- история покупок, фактические цены и оценка бюджета;
- список продуктов дома и подбор рецептов по выбранным ингредиентам;
- импорт и экспорт versioned JSON backup без изменения существующего формата данных;
- английский и украинский интерфейс, светлая, тёмная и системная темы;
- установка как PWA, offline reload и управляемое обновление service worker;
- полностью локальное хранение списка, истории, настроек и цен.

## Стек

- React 19 и TypeScript в strict mode;
- Vite 6 и `vite-plugin-pwa`/Workbox;
- Zustand для состояния приложения;
- Dexie/IndexedDB для постоянных пользовательских данных;
- React Router с `HashRouter` для совместимости с GitHub Pages;
- Vitest и ESLint для автоматических проверок;
- TheMealDB для поиска рецептов;
- TensorFlow.js в изолированном экспериментальном ML-модуле, который не входит в
  основной startup bundle.

## Требования

- Node.js 22 (та же версия используется в CI);
- npm с поддержкой lockfile из репозитория;
- современный браузер с IndexedDB; для установки PWA нужен HTTPS или localhost.

## Установка и локальный запуск

```bash
npm install
npm run dev
```

Vite покажет локальный URL. Пользовательские данные development-окружения хранятся в
IndexedDB origin локального сервера.

Для воспроизводимой установки в CI используйте:

```bash
npm ci
```

## Команды

```bash
npm run dev          # development server
npm run lint         # ESLint
npm run typecheck    # отдельная TypeScript-проверка
npm run test         # все тесты один раз
npm run test:watch   # Vitest watch mode
npm run build        # production build в dist/
npm run preview      # локальный preview production build
npm run check        # lint + typecheck + test + build
```

`build` намеренно не скрывает typecheck внутри себя: локально и в CI эти этапы запускаются
отдельно, поэтому причина ошибки видна сразу.

## Переменные окружения

Скопируйте `.env.example` в `.env.local`, если нужно изменить defaults:

```dotenv
VITE_MEALDB_API_KEY=1
VITE_BASE_PATH=/ListOfProducts/
```

`VITE_BASE_PATH` должен быть URL path с ведущим и завершающим `/`. Для custom domain в
корне используйте `/`. Production fallback для текущего GitHub Pages deployment —
`/ListOfProducts/`, development fallback — `/`.

Все переменные с префиксом `VITE_` встраиваются в публичный JavaScript. Поэтому
`VITE_MEALDB_API_KEY` нельзя использовать для секрета или приватного платного ключа. Если
провайдер требует скрытый credential, запросы должны идти через backend/serverless proxy.

## PWA и offline-поведение

Production build генерирует `manifest.webmanifest` и `sw.js`.

- HTML, versioned JavaScript/CSS, manifest и необходимые иконки попадают в precache.
- Навигация использует SPA fallback на `index.html`; hash-маршруты не требуют серверных
  rewrites.
- Запросы к TheMealDB используют `NetworkFirst` с timeout и ограниченным cache.
- Изображения рецептов используют `CacheFirst` с `maxEntries` и `maxAgeSeconds`.
- Удаляемые runtime caches помечены для очистки при quota pressure; устаревший precache
  очищается Workbox.
- Список, настройки, pantry, история и цены находятся в IndexedDB и не зависят от HTTP
  cache/service worker, поэтому обновление PWA их не удаляет.
- Когда новая версия service worker готова, приложение показывает отдельное постоянное
  уведомление. Обновление активируется только после нажатия кнопки, что исключает
  неожиданный reload и циклы обновления.
- После первого успешного precache приложение можно перезагрузить без сети. Новый поиск
  рецептов требует сеть либо ранее сохранённый подходящий runtime response.

Параметры manifest (`id`, `start_url`, `scope`) вычисляются из того же `base`, что и Vite,
поэтому они должны совпадать с фактическим production path.

## Хранение и сохранность данных

Dexie-база `smart-shopping-list` использует versioned migrations. Текущая схема включает
категории, товары, шаблоны, настройки, историю, память продуктов, metadata списков, цены и
pantry.

JSON backup имеет собственную версию. Импорт:

- проверяет структуру, числовые диапазоны, непустые значения и уникальность ключей;
- мигрирует старые backup-версии к текущему формату;
- нормализует legacy-сценарий с товарами нескольких текущих списков;
- проверяет связанные цены, события и категории;
- заменяет данные и восстанавливает defaults в одной IndexedDB-транзакции.

Файл импорта ограничен 10 MiB, чтобы случайный или недоверенный JSON не блокировал вкладку.
Перед очисткой данных рекомендуется сохранить export.

## Структура проекта

```text
src/
  app/          orchestration, global boundary и PWA lifecycle
  components/   переиспользуемый presentational UI
  contexts/     локализация
  data/         встроенный каталог и defaults
  db/           Dexie schema, migrations и атомарные операции базы
  domain/       доменные типы
  features/     shopping list, shopping mode, dialogs, pantry/recipes
  hooks/        общие DOM hooks
  lib/          parsing, formatting и localization
  ml/           изолированный локальный ML-модуль
  navigation/   маршруты и порядок навигации
  pages/        вторичные экраны, загружаемые отдельным chunk
  pricing/      чистые расчёты цен и бюджета
  recipes/      API client, mapping, ranking и тесты
  storage/      безопасные browser-storage adapters
  store/        Zustand actions и синхронизация с IndexedDB
  styles/       глобальная responsive/mobile-first тема
  utils/        общие shopping helpers
```

## Deployment на GitHub Pages

Workflow `.github/workflows/deploy.yml` запускается для pull request и push в `main`.
Build job выполняет `npm ci`, lint, typecheck, tests, security audit и production build.
Для pull request deployment не выполняется; push загружает `dist/` через официальный Pages
artifact/deploy workflow.

Если repository name или hosting path изменился, обновите `VITE_BASE_PATH` в workflow.
Для custom domain, который обслуживает приложение из корня, задайте `/`.

## Безопасность

- Рецептные URLs принимаются только по HTTPS; HTTP разрешён только для локального API origin.
- Внешние ссылки открываются с `noopener noreferrer`.
- API responses и импортируемые backups проверяются до использования.
- В репозитории не должно быть реальных `.env`, токенов или приватных ключей.
- Пользовательские данные не считаются секретно зашифрованными: они доступны JavaScript на
  том же browser origin.

## Известные ограничения

- Нет cloud sync и multi-device synchronization; данные локальны для конкретного browser
  profile/origin.
- Разные GitHub Pages projects одного account используют один origin, поэтому строгая
  изоляция IndexedDB требует отдельного custom subdomain/domain.
- Уже накопленная большая история пока отображается без virtualization/pagination.
- Рецептный API сторонний: доступность, rate limits и набор результатов зависят от TheMealDB.
- Экспериментальный ML-модуль не подключён к основному пользовательскому сценарию и имеет
  отдельное IndexedDB-хранилище модели.

## Проверка перед изменениями

```bash
npm install
npm run check
npm audit --audit-level=high
```

Для PWA-изменений дополнительно откройте production preview, проверьте manifest и service
worker в DevTools, выполните offline reload и убедитесь, что IndexedDB-данные сохранились.
