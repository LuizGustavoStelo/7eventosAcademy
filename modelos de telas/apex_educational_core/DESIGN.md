# Design System Document

## 1. Overview & Creative North Star: "The Academic Curator"

This design system is engineered to transform a standard educational management platform into a high-end, editorial dashboard experience. The Creative North Star is **"The Academic Curator"**—a philosophy that balances the raw energy of educational growth with the sophisticated precision of high-level management.

Instead of a generic "software" look, we employ **Editorial Structuralism**. This means we break away from rigid, boxed-in grids and 1px borders. We utilize intentional white space (negative space), sophisticated typography scales, and a layered depth model that mimics high-end physical stationery and frosted glass. The goal is to make the platform feel like a premium workspace where every data point is curated, not just displayed.

---

## 2. Colors: Tonal Depth over Borders

The palette is anchored by a high-energy Primary Orange (`#ff5c00`), grounded by a spectrum of architectural greys and blacks.

### The "No-Line" Rule
To achieve a signature premium feel, **1px solid borders for sectioning are strictly prohibited.** Boundaries must be defined solely through:
- **Background Color Shifts:** Use `surface-container-low` sections sitting on a `surface` background.
- **Tonal Transitions:** Define workspace areas by moving from `surface-container-lowest` to `surface-container`.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, physical layers.
- **Base Layer:** `surface` (#f9f9f9) – The global background.
- **Secondary Layer:** `surface-container-low` (#f3f3f3) – Large content blocks.
- **Priority Layer:** `surface-container-lowest` (#ffffff) – Individual KPI cards or data entries, creating a "lift" effect without shadows.

### The "Glass & Gradient" Rule
Floating elements (modals, dropdowns, or hovering action menus) should utilize **Glassmorphism**. Use semi-transparent surface colors with a `backdrop-blur` of 20px to 40px. 

### Signature Textures
Main CTAs and hero data points should utilize a **linear gradient** transitioning from `primary` (#a73a00) to `primary-container` (#ff5c00). This provides a visual "soul" and prevents the interface from feeling clinically flat.

---

## 3. Typography: The Editorial Scale

We use a dual-font strategy to balance character with readability.

*   **Display & Headlines (Manrope):** A modern, geometric sans-serif used for high-level data and page titles. This font carries the "Editorial" weight.
*   **Body & Labels (Inter):** A workhorse typeface designed for maximum legibility in complex data tables and management interfaces.

| Level | Token | Font | Size | Weight |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Manrope | 3.5rem | 700 |
| **Headline** | `headline-sm` | Manrope | 1.5rem | 600 |
| **Title** | `title-md` | Inter | 1.125rem | 500 |
| **Body** | `body-md` | Inter | 0.875rem | 400 |
| **Label** | `label-sm` | Inter | 0.6875rem | 600 (Caps) |

---

## 4. Elevation & Depth: Tonal Layering

Traditional drop shadows are replaced with **Ambient Tonal Layering**.

- **The Layering Principle:** Depth is achieved by "stacking" the surface tiers. A `surface-container-lowest` card placed on a `surface-container-low` section creates a soft, natural lift.
- **Ambient Shadows:** For floating elements (e.g., a search bar), use extra-diffused shadows.
    - *Shadow:* `0px 12px 32px rgba(0, 0, 0, 0.04)`
- **The "Ghost Border" Fallback:** If accessibility requires a boundary, use a **Ghost Border**: `outline-variant` at 15% opacity. Never use 100% opaque borders.
- **Glassmorphism:** Apply a `backdrop-blur` to the fixed left sidebar (264px) to allow content to subtly bleed through, making the layout feel integrated and expansive.

---

## 5. Components

### Navigation: The Fixed Monolith
- **Sidebar:** 264px width. Background: `surface-container-lowest` with a "Ghost Border" on the right. 
- **Active State:** Use a vertical "Signature Orange" pill (`primary`) on the left edge, with the menu item text shifting to `on-surface`.

### Action Buttons
- **Primary:** Gradient (`primary` to `primary-container`), Roundedness: `md` (0.375rem).
- **Secondary:** Transparent background with a `ghost-border`.
- **Tertiary:** Text-only, using `primary` color for the label, used for low-priority actions.

### Data Tables & Lists
- **No Divider Lines:** Separate rows using `Spacing 4` (0.9rem) of vertical white space or a subtle hover state shift to `surface-container-high`.
- **Header:** Use `label-md` in `on-surface-variant` for column titles.

### KPI Cards
- Background: `surface-container-lowest`.
- Content: A combination of `headline-md` for the metric and `label-sm` for the description.
- Accent: A subtle 4px corner radius accent in `primary` orange.

### Input Fields
- Background: `surface-container-high`.
- Focus State: Transition background to `surface-container-lowest` and add a `primary` ghost-border. No heavy "blue" focus rings; stay within the orange/grey spectrum.

---

## 6. Do's and Don'ts

### Do:
- **Do** use negative space as a separator. If in doubt, increase the spacing scale instead of adding a line.
- **Do** use `on-surface-variant` for secondary information to create a clear typographic hierarchy.
- **Do** apply `backdrop-blur` to all floating overlays to maintain the "frosted glass" aesthetic.
- **Do** ensure Dark Mode utilizes the `surface-dim` and `inverse-surface` tokens to maintain professional contrast without eye strain.

### Don't:
- **Don't** use 1px solid black or grey borders to divide content.
- **Don't** use standard "drop shadows" with high opacity.
- **Don't** use the Primary Orange for large background areas; it is a "surgical" accent for CTAs and status indicators only.
- **Don't** use more than two font families. Stick to the Manrope/Inter pairing.