---
version: 1
slug: "src-features-shoppinglist-index-tsx"
primary_target: "src/features/ShoppingList/index.tsx"
related_targets: ["src/components/AppLayout/index.tsx","src/features/PantryRecipes/index.tsx","src/pages/SecondaryScreens/index.tsx","src/styles/globals.css"]
---

# Mobile shopping redesign

Mode: Operate. User confirmed personal shopping on a phone, preservation of every existing capability, and code-first delivery. On 2026-10-20 the user requested safer directions, then said "делай"; proceed with the presented Daily direction.

## Direction contract

THESIS: A light daily organiser that lets the shopper read, add and check items immediately. Replace mint cards and repeated introductory banners with a clear list and a consistent action hierarchy.

OWN-WORLD: White surfaces on a light lilac-grey ground, graphite text, plum-violet actions, understated borders, softly squared controls and an unboxed heading. System UI typography for legibility and offline availability.

STORY: Prepare the list, see purchase progress and budget, enter shopping mode, then consult pantry, recipes and history through familiar navigation.

FIRST VIEWPORT: A compact brand header, a 28px list heading, a progress strip and primary shopping action above the list. A fixed 56px composer sits above five bottom destinations on phones. Desktop uses a persistent left navigation and a wide centred workspace.

FORM: Daily organiser, safer user-requested hand, seed ccc8856b. The user delegated the remaining visual decisions. Signature interaction: a purchase fills its checkbox, strikes the item and advances the progress bar using a shared 200ms ease-out; reduced motion removes transitions.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Verification

- [x] Existing app explored and original mobile/desktop UI inspected.
- [x] Baseline lint, typecheck, 45 tests and production build pass.
- [x] Redesign every existing screen and dialogs through shared tokens.
- [x] Run lint, typecheck, tests and production build after changes.
- [x] Verify populated and empty list, shopping mode, budget, pantry, history, settings, languages and both themes in browser.
- [x] Capture desktop and mobile, run detector, finish review and design documentation.

Resume: npm run dev -- --host 127.0.0.1; npm run check.

## Verification boundaries

Browser QA used actual local IndexedDB for add/check/undo/price/budget/reload, pantry and recipe ingredient additions. Recipe success, empty and HTTP503 states used intercepted synthetic responses; the live TheMealDB service was not exercised. Keyboard Enter and hiding all purchased items passed in an isolated browser context. No physical phone installation was tested. Final capture sizes:320,390,768,1440; after reviewer fixes scrollWidth equals documentElement.clientWidth (including classic scrollbar cases). Independent finish review resolved both findings: whole currency values now wrap as blocks; 320px has no horizontal scrollbar. PNG icons are rendered from the existing vector basket source with origin metadata.

Final typography check: long item names wrap without hover (4 lines at390px,5 at320px); hover only changes colour. Independent verdict resolved this correction. DESIGN.md and .impeccable/design.json verified against final CSS.
