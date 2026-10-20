---
name: Smart Shopping List
description: Daily organiser for familiar, readable mobile shopping.
colors:
  canvas: "#f6f5f9"
  surface: "#ffffff"
  surface-subtle: "#f7f6fa"
  surface-hover: "#f0edf7"
  ink: "#292635"
  muted: "#6a6578"
  accent: "#7052c4"
  accent-hover: "#5f40b1"
  accent-soft: "#eee9fa"
  accent-ink: "#6040ae"
  on-accent: "#ffffff"
  line: "#e7e3ed"
  line-strong: "#9588a8"
  success: "#2c7553"
  success-soft: "#edf7f0"
  warning: "#916008"
  warning-soft: "#fff5dc"
  danger: "#ad3d49"
  danger-soft: "#fceef0"
  dark-canvas: "#16141d"
  dark-surface: "#201d29"
  dark-surface-subtle: "#282432"
  dark-surface-hover: "#322b40"
  dark-ink: "#f3eff8"
  dark-muted: "#b4adbf"
  dark-accent: "#b9a1f5"
  dark-accent-hover: "#c8b4ff"
  dark-accent-soft: "#332946"
  dark-accent-ink: "#d2c0fc"
  dark-on-accent: "#231735"
  dark-line: "#38323f"
  dark-line-strong: "#8f809f"
  dark-success: "#94d4af"
  dark-success-soft: "#23392d"
  dark-warning: "#f2ce86"
  dark-warning-soft: "#3c301e"
  dark-danger: "#f1a0aa"
  dark-danger-soft: "#422730"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "30px"
    fontWeight: 750
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  headline-desktop:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "36px"
    fontWeight: 750
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  item-title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 650
  field:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "16px"
    fontWeight: 500
  item-meta:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "11px"
    fontWeight: 450
    lineHeight: 1.4
rounded:
  track: "3px"
  checkbox: "9px"
  field: "10px"
  control: "12px"
  panel: "16px"
  pill: "999px"
spacing:
  step-4: "4px"
  step-6: "6px"
  step-8: "8px"
  step-10: "10px"
  step-12: "12px"
  step-14: "14px"
  step-16: "16px"
  step-18: "18px"
  step-20: "20px"
  step-22: "22px"
  step-24: "24px"
  step-28: "28px"
  step-40: "40px"
  step-48: "48px"
  step-64: "64px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "48px"
  button-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "48px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "0 18px"
    height: "48px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.field}"
    padding: "0 12px"
    height: "48px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
  chip:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "7px 11px"
    height: "44px"
  navigation-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
  checkbox-checked:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.checkbox}"
    size: "28px"
---
# Design System: Smart Shopping List

## Overview

**Creative North Star: "Daily organiser"**

Daily organiser uses white panels on a lilac-grey canvas, graphite text and a plum-violet action hierarchy. Familiar controls, readable shopping rows and restrained borders support shopping with one hand.

The dark variant keeps the same semantic roles and geometry. System UI typography is a confirmed choice for offline availability and legibility; no remote font or new dependency is required. Preserve English and Ukrainian copy, existing capabilities and local data.

**Key Characteristics:**
- Mobile actions remain within reach above safe-area-aware bottom navigation.
- Unboxed headings establish hierarchy; panels group useful content.
- One purple action family, with separate success, warning and danger semantics.
- Shared theme tokens, familiar controls and restrained state transitions.

## Colors

A lilac-grey neutral family keeps purple actions distinct without competing with groceries or prices. The frontmatter records exact light values and their `dark-` counterparts; runtime theme selection overrides the same CSS custom property names under `[data-theme="dark"]`.

### Primary

- **Plum violet** (`accent`, `accent-hover`): filled primary buttons, composer submission and checked purchase boxes.
- **Lilac selection** (`accent-soft`, `accent-ink`): selected navigation, secondary actions, progress labels and prices.
- **On accent** (`on-accent`): text and icons on a filled accent background. This role changes independently in dark mode.

### Neutral

- **Lilac-grey canvas** (`canvas`): page ground.
- **White panel** (`surface`): cards, fields, composer, navigation and dialogs; dark mode uses a deep violet-grey panel.
- **Quiet layers** (`surface-subtle`, `surface-hover`): bought rows, quiet content and hover treatments.
- **Graphite text** (`ink`) and **muted violet-grey** (`muted`): primary text and supporting information.
- **Soft divider** (`line`) and **control outline** (`line-strong`): panel separators and stronger field/checkbox boundaries.

### Status

- **Success** (`success`, `success-soft`): positive notices.
- **Warning** (`warning`, `warning-soft`): budget risk, missing ingredients and offline notices.
- **Danger** (`danger`, `danger-soft`): over-budget state and destructive actions.

**The Semantic Pair Rule.** Pair filled accent controls with on-accent; pair accent-soft surfaces with accent-ink. Warning and danger remain independent status families.

## Typography

**Body and heading font:** the system UI stack in the frontmatter. There is no separate display or mono family.

The type is compact and practical. Shopping names carry more weight than quantity and price metadata. Numeric totals and progress values use tabular numerals.

- **Headline:** list title (30px, 750, 1.15, -0.035em); secondary-screen titles use line-height (1.2). Desktop titles grow to (36px); widths below (390px) use (27px). Pantry headings have a mobile override (28px) below (600px).
- **Item title:** (15px, 650, 1.4, -0.015em); desktop (16px). Names wrap anywhere when needed, including without hover. Purchased names become muted with a line-through. Hover changes the name color to accent-ink without changing its metrics.
- **Body copy:** (14px, 400, 1.6), with subtitles constrained to (56ch) or (62ch).
- **Button label:** (14px, 650). Field input is (16px, 500).
- **Item metadata:** (11px, 450, 1.4); desktop (12px). Navigation is (10px) on mobile and (13px) on desktop; this is a navigation-specific treatment, not a general body-text size.

**The Offline Type Rule.** Use the existing system UI stack for every text role; hierarchy comes from size, weight and spacing.

## Layout

Mobile is the base layout. The shell has horizontal gutters (20px), reduced to (12px) below (390px), and safe-area padding. Body `min-width: 0` allows classic scrollbars at narrow widths. Screen sections use a (24px) gap; common internal spacings are (8px), (12px), (16px), (20px) and (24px), with component-specific steps retained in the frontmatter rather than forcing a new scale.

The composer is fixed (16px) from each side and (84px + safe-area inset) above the bottom. Its (48px) controls plus (7px) vertical padding produce a (62px) bar. Five bottom destinations sit in a fixed navigation strip with minimum height (72px + safe-area inset). List bottom padding and toast positioning leave room for these controls.

At width at least (900px) **and** height at least (600px), the shell becomes a two-column frame capped at (1440px), with a sticky (232px) navigation rail and workspace padding (24px 40px 48px). The content is capped at (960px); bottom navigation is hidden and the composer becomes sticky at (16px) with no shadow. Short windows keep mobile navigation.

At width at least (1200px) and height at least (600px), the rail grows to (256px), workspace horizontal padding to (64px), and the overview places its budget in a (280px) side column separated by (28px). Recipes use a filter/results layout. Below (600px), settings controls and dialog actions wrap or stack. Budget values use flex-wrap and preserve complete amounts rather than truncating them.

## Elevation & Depth

Borders and subtle tonal layers define ordinary panels. Floating UI uses one shared elevation: light (`0 10px 30px rgba(35, 26, 57, 0.12)`), dark (`0 10px 30px rgba(0, 0, 0, 0.26)`). Dialog backdrops use (`rgba(22, 17, 35, 0.5)`).

**The Floating Tools Rule.** Ordinary panels use borders and tonal separation. Reserve elevation for the fixed composer, dialogs and toasts.

## Shapes

Soft squares organize the interface: panel/dialog/composer corners (16px), standard buttons/navigation (12px), fields (10px), purchase boxes (9px) and progress tracks (3px). Recipe-filter chips use a pill shape (999px). Dividers are normally (1px); unchecked purchase-box strokes are (1.5px).

## Components

### Buttons

Primary, secondary, danger and quiet variants share a minimum height (48px), padding (0 18px) and radius (12px). Primary uses accent/on-accent and changes to accent-hover. Secondary uses accent-soft/accent-ink and surface-hover on hover. Danger uses danger-soft/danger. Quiet uses transparent/muted and surface-hover/ink on hover. Icon and small controls are (44px). Disabled buttons retain their geometry with opacity (0.55) and a not-allowed cursor.

### Chips

Recipe filters have minimum height (44px), padding (7px 11px), a line border and pill corners. Selection uses accent border, accent-ink text and accent-soft fill. Category controls follow the same semantic selection pairing.

### Cards / Containers

The shared panel uses surface fill, line border and corners (16px). Shopping sections use padding (16px 12px), increasing to (24px) on desktop; narrow widths reduce horizontal padding to (8px). Other content cards commonly use (22px). Headings remain unboxed.

### Inputs / Fields

Fields have minimum height (48px), padding (0 12px), line-strong border, surface fill and (10px) corners. Focus changes the border to accent and adds an accent outline. Carets use accent; placeholders use muted at full opacity. Visible labels and contextual errors remain part of each form.

### Navigation

Mobile has five equally sized destinations with (52px) minimum item height and (21px) icons. Active destinations use accent-soft/accent-ink and stronger weight. Desktop destinations use minimum height (48px), left alignment and (13px) labels. The selected destination retains `aria-current="page"`.

### Shopping row and progress

Shopping rows have minimum height (76px), growing to (80px) on desktop, with separate (44px) action columns. The purchase target is at least (60px) tall and includes a (28px) checkbox. Bought rows use a subdued background and struck-through name; progress uses a (6px) track. Shopping mode uses larger rows within its existing modal/focus-trap behavior.

### Focus and motion

Keyboard focus uses an accent outline (2px), normally offset (3px); fields additionally keep their focus border, and custom checkbox focus is transferred to its visible control. Composer input focus has offset (0). Buttons, navigation, purchase checks and progress share transitions (200ms) using `cubic-bezier(0.16, 1, 0.3, 1)`. Loading skeletons use (1.2s) alternate shimmer and loading icons spin over (850ms). Under reduced motion, scrolling becomes immediate and animation/transition durations become (0.01ms) with one animation iteration.

### Identity assets

The basket mark uses purple fill and a white vector stroke. `public/favicon.svg` is the vector source for the installed PWA icon family. Reuse the existing Lucide icons and shipped local assets; no new dependency or font download is part of this system.

## Do's and Don'ts

### Do:

- **Do** use the CSS semantic roles for both themes, including on-accent for filled controls.
- **Do** preserve complete budget amounts through wrapping and local overflow when necessary.
- **Do** preserve visible keyboard focus, accessible labels and reduced-motion behavior.
- **Do** keep the existing data, localizations and functions; reuse the installed icon set without new dependencies.

### Don't:

- **Don't** hardcode light-theme white on purple controls: dark mode uses a dark on-accent token.
- **Don't** replace familiar task controls with decorative banners or introduce a remote font dependency.
- **Don't** impose a body minimum width that causes horizontal scrolling when classic scrollbars reduce a narrow viewport.
- **Don't** apply overlay elevation to ordinary panels or shrink primary touch controls below their shipped sizes.
