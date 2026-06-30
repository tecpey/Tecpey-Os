---
name: impeccable
description: Design quality audit and polish for TecPey UI. Provides commands for auditing color/contrast, typography, spacing, accessibility, and design consistency. Use when reviewing or polishing any UI component or page. Does not modify code automatically — produces design critique and actionable recommendations.
---

# Impeccable — TecPey Design Audit Skill

**Source:** github.com/pbakaus/impeccable
**License:** Apache 2.0
**Adoption:** Reference (adapted SKILL.md — no Astro site, no build scripts, no hooks installed)
**Audit date:** 2026-06-30

---

## What This Skill Provides

A design quality system with commands for auditing and polishing UI. Impeccable
operates in two registers:

- **Brand** — design IS the product (landing pages, marketing, campaign surfaces)
- **Product** — design SERVES the product (app UI, dashboards, data-dense tools)

For TecPey:
- Exchange surfaces, Academy dashboards, Admin → **Product register**
- Marketing pages, landing pages, hero sections → **Brand register**

---

## Commands

Use these commands when reviewing TecPey UI:

### `/impeccable audit`
Full design audit of a surface. Checks:
- Color contrast (WCAG 2.1 AA — 4.5:1 for body, 3:1 for large text)
- Typography hierarchy (is there a clear H1 → H2 → body → caption chain?)
- Spacing consistency (are margins/padding following the spacing scale?)
- Alignment (grid violations, orphaned elements)
- Accessibility (focus states, ARIA labels, keyboard traps)
- RTL readiness (does layout break in RTL mode?)

### `/impeccable polish`
Refine an existing design for production quality. Focus areas:
- Tighten spacing
- Improve micro-contrast between related elements
- Ensure interactive states (hover, focus, active, disabled) are all handled
- Verify empty states and loading states exist

### `/impeccable colorize`
Audit color usage. In **product register**, favor:
- Semantic colors (success, error, warning, info) over decorative
- High contrast for data values (prices, quantities)
- Consistent brand accent usage — no one-off colors
- No color as the sole conveyor of meaning (accessibility)

### `/impeccable typeset`
Audit typography. In **product register**, check:
- Clear size hierarchy
- Appropriate font weight for data density
- Mono font for all numerical values (prices, IDs, balances)
- Persian / Arabic script rendered with correct typeface
- Line height ≥ 1.4 for body; ≤ 1.2 for display/hero

### `/impeccable layout`
Audit layout structure. Check:
- Consistent grid (8px base grid recommended)
- Responsive breakpoints don't break core user flows
- RTL layout mirrors correctly
- No absolute positioning that breaks in RTL

### `/impeccable animate`
Audit animation (in **product register**, apply with extreme restraint):
- Motion must serve a UX purpose (not decorative)
- Respect `prefers-reduced-motion`
- Duration: ≤ 200ms for micro-interactions; ≤ 400ms for layout transitions
- No animation on data-dense surfaces (order books, price tables)

### `/impeccable quieter`
Reduce visual noise. Remove or reduce:
- Redundant borders
- Excess color variation
- Decorative icons that add no information
- Animation on elements that don't need it

### `/impeccable bolder`
Increase visual hierarchy where design feels flat:
- Increase weight of primary CTA
- Strengthen heading size contrast
- Add breathing room around key information
- Make empty/disabled states visually distinct

### `/impeccable critique`
Honest design critique: what isn't working and why.
- Name the specific problem
- Name the design principle being violated
- Propose exactly one fix (not a list of options)

---

## Design Laws for TecPey

These laws govern all UI decisions:

1. **Contrast is non-negotiable** — WCAG 2.1 AA minimum, always
2. **Hierarchy before decoration** — establish visual hierarchy before adding any visual interest
3. **RTL/LTR parity** — every layout decision must work in both directions
4. **Density serves data** — for exchange/trading surfaces, information density is a feature, not a bug
5. **Trust is earned by consistency** — inconsistent UI erodes financial trust
6. **Persian is not an afterthought** — Persian UI receives the same design care as English UI
7. **Motion earns its place** — if you can't justify the animation, remove it

---

## What Impeccable Does NOT Do

- Does not touch code automatically
- Does not install dependencies
- Does not change business logic
- Does not generate new component files
- Does not override the TecPey brand system

All suggestions are recommendations; implementation requires explicit user instruction.
