---
name: ui-ux-pro
description: UI/UX design intelligence for TecPey. Provides searchable design system guidance covering styles, color palettes, typography, chart types, and UX best practices for Next.js + Tailwind stacks. Reference only — does not modify code automatically.
---

# UI/UX Pro Max — TecPey Reference

**Source:** github.com/nextlevelbuilder/ui-ux-pro-max-skill
**License:** MIT
**Adoption:** Reference (SKILL.md only — no Python scripts or CSV data installed)
**Audit date:** 2026-06-30

---

## What This Skill Provides

Design intelligence for building professional interfaces. Covers:

- **UI Styles** — glassmorphism, minimalism, neumorphism, brutalism, enterprise-clean, dark-luxury
- **Color Palettes** — by product type (SaaS, fintech, education, enterprise)
- **Typography** — font pairings with Google Fonts; display vs. body vs. mono guidance
- **Chart Types** — correct chart selection for trading (candlestick, line, volume), analytics (bar, pie), and dashboards
- **UX Patterns** — best practices, anti-patterns, CTA strategy, page structure
- **Stack Support** — Next.js, Tailwind, shadcn (TecPey's stack)

---

## How to Use This Skill

When asked to design or review UI, consider:

### Product Type: Fintech / Exchange Platform

Suitable styles for TecPey Exchange surfaces:
- Enterprise-clean dark (primary — matches TecPey dark design system)
- Minimal data-dense (for order books, price tables, market data)
- Trust-signals-first layout (for onboarding, KYC, financial flows)

Avoid for exchange:
- Glassmorphism on data-heavy surfaces (legibility issue)
- Brutalism (incompatible with trust signals)
- Excessive gradients on interactive elements

### Product Type: Academy / EdTech

Suitable styles for TecPey Academy surfaces:
- Warm-modern (progress, celebration, achievement)
- Clean card-based layouts (lesson cards, certificate display)
- Accessible color contrast (students may use varied devices/lighting)

### Color Principles (TecPey)

- Dark background surfaces — use high-contrast text
- Accent colors — consistent across Persian and English views
- RTL-aware layouts — color emphasis must not rely on left-to-right reading order
- Never introduce new brand colors not in the existing design system

### Typography Principles (TecPey)

- Persian (Farsi) text requires a compatible Persian-supporting typeface
- English/Persian parity — font weights must feel equivalent across both scripts
- Mono for: prices, order IDs, hash values, code
- Body text minimum: 14px / 0.875rem; captions minimum: 12px / 0.75rem

### Chart Types (TecPey Exchange)

| Data | Recommended Chart |
|---|---|
| Price over time | Candlestick (OHLCV) or Line |
| Volume | Bar (below price chart) |
| Portfolio allocation | Pie or Donut |
| P&L over time | Area |
| Order book depth | Depth chart (stepped area) |
| Market comparison | Grouped bar or table |

### UX Anti-Patterns to Avoid

- Disabled buttons with no tooltip explaining why
- Input validation that only fires on submit
- Ambiguous "Cancel" — cancel order vs. cancel dialog
- Loading spinners with no timeout state
- Toasts that auto-dismiss before the user can act

---

## Compatibility with TecPey UX Rules

All UI suggestions from this skill must comply with TecPey UX rules:
- No unnecessary animation
- RTL/LTR parity
- Accessibility (WCAG 2.1 AA)
- No fake logos or placeholder assets
- No random design styles outside the established system
