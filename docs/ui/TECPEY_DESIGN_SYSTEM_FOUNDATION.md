# TecPey Design System Foundation

**Status:** Brand and UI execution lock for the next page-by-page redesign PRs
**Date:** 2026-08-09
**Companion contracts:** `docs/ui/TECPEY_VISUAL_IDENTITY_ARENA_MENTOR_DISCOVERY_AUDIT.md`, `docs/architecture/TECPEY_CONTENT_GROWTH_AUTOMATION_CONTRACT.md`

## Design Read

TecPey is a Persian-first financial education and trading operating system for beginners, serious learners and future exchange users. The interface must feel secure, clear, data-literate and brand-owned. It should not read as a generic crypto template, a purple AI dashboard, a decorative glass landing page, or a copied exchange UI.

## Non-Negotiable Identity

- The official TP blue/cyan mark is the only primary brand symbol.
- Runtime marks must render through `src/components/brand/TecpeyMark.tsx` or the governed canonical asset path.
- Source brand references are locked in `docs/assets/brand/brand-assets.json`.
- Do not recolor, stretch, regenerate, add new shadows to, or substitute the TP mark without a dedicated brand review.
- Persian surfaces are first-class and must be designed in RTL first; English is a professional LTR peer, not a thin translation.

## Governed Brand Sources

| Asset Role | Path |
| --- | --- |
| Canonical runtime icon | `public/images/tecpey-logo.png` |
| Runtime alias | `public/logo.png` |
| Compact runtime mark | `public/images/brand/tecpey-logo-256.png` |
| Official documentation preview | `docs/assets/brand/tecpey-logo-official.webp` |
| Uploaded TP source references | `docs/assets/brand/source/*` |
| Brand registry | `docs/assets/brand/brand-assets.json` |

The five founder-supplied images attached to this work match the existing registered source hashes. No duplicate brand-source asset is required.

## Visual Language

| Dial | Decision |
| --- | --- |
| Palette | Blue/cyan TP family with neutral white/slate surfaces. No purple default, no beige fintech palette, no decorative orb system. |
| Density | Medium on public trust pages; high on markets, coins, tools, Arena and admin-like surfaces. |
| Motion | Restrained, 140-260ms, transform/opacity/background only, with reduced-motion support. |
| Shape | Controls use `--tp-radius-control`; panels use `--tp-radius-panel`; hero/product shells may use `--tp-radius-hero`. |
| Typography | Persian: IRANYekanX. English: existing project default. Use tabular numerals for prices, ranks and metrics. |
| Cards | Use cards for repeated entities, dialogs and framed tools. Avoid nested cards and decorative panels that slow scanning. |
| Charts | Keep chart surfaces full and inspectable. Never hide chart truth behind decorative overlays. |

## Token Contract

The shared runtime token file is `src/app/tecpey-brand-tokens.css`.

Required token families:

- Core: `--tp-bg`, `--tp-surface`, `--tp-card`, `--tp-text`, `--tp-muted`
- Brand: `--tp-primary`, `--tp-primary-strong`, `--tp-primary-soft`, `--tp-cyan`, `--tp-cyan-soft`
- State: `--tp-success`, `--tp-danger`, `--tp-warning`, `--tp-info`, `--tp-focus`
- Structure: `--tp-border`, `--tp-border-strong`, `--tp-shadow-soft`, `--tp-shadow-panel`
- Shape and motion: `--tp-radius-control`, `--tp-radius-panel`, `--tp-radius-hero`, `--tp-ease-out`, `--tp-ease-in-out`, duration tokens

New page work should use tokens before raw hex values. Raw colors are acceptable only for third-party chart constraints, external asset previews, or a documented exception.

## Page Family Direction

| Page Family | UX Goal | Required Shared Modules |
| --- | --- | --- |
| Landing | Explain the safe entry promise and equal paths to exchange and Academy while exposing the most useful growth routes. | Dual CTA, TP mark, trust states, Academy/Arena/Mentor blocks, 5 news-led coin/5 tool growth radar, FAQ/schema. |
| Academy | Make learning feel structured, real and progress-based. | Term shell, lesson state, quiz state, Mentor evidence, certificates, wrong-answer loop. |
| Trading Arena | Give a serious practice cockpit without pretending to be live exchange authority. | Market status, data-source clarity, chart shell, command states, journal/Mentor evidence. |
| Coins | Convert search intent into educational decision hygiene. | Priority news row, official links, risk context, related lessons/tools, FAQ/schema. |
| News | Make news useful without hype or financial advice. | Impact labels, source/time, related coins/tools/lessons, canonical detail pages. |
| Tools | Curate a professional toolbox. | Featured five, ranked list, official links, iframe/fallback policy, safety notes. |
| Glossary/Learn | Become citable answer-engine pages. | Definition block, AEO answer, examples, related entities, schema. |
| English | Match strategic quality, not literal copy. | LTR layout, English metadata, equivalent CTA intent, no Persian leftovers. |

## Interaction Rules

- Minimum touch target: 44px.
- Every entity card needs loading, empty, error and stale states when data is dynamic.
- Icon-only actions require accessible labels and visible focus.
- Buttons need press feedback via `tecpey-pressable` or an equivalent transform-only interaction.
- Keyboard navigation must work for menus, filters, dialogs, ranked lists and tool detail surfaces.
- News/coin/tool ranks must expose `updatedAt` or a clear stale/degraded state.
- Account-boundary UI must state that Academy and the temporary `my.tecpey.ir` exchange account are separate until the identity bridge ships.

## SEO/GEO/AEO Design Requirements

The visual system must support discoverability instead of treating SEO as invisible metadata.

- Pages need crawlable headings and concise answer blocks.
- FAQ and structured-data content must match visible content.
- Related entity blocks should be designed as product modules, not afterthought link lists.
- Landing ranked cards must stay limited to exactly five news-led coins and five tools so the homepage remains scannable and does not become a market table.
- Persian and English page templates must reserve space for canonical/hreflang, `dateModified`, source attribution and no-advice notes.
- AI-readable summaries must be educational, not promotional.

## Banned Defaults

- AI-purple gradients as a default accent.
- Beige/tan/gold finance templates.
- Dark mesh backgrounds with decorative glow as the main identity.
- Whole pages made from nested floating cards.
- Hero copy that hides primary CTAs below the first viewport.
- Static-only success states with no loading/error/empty design.
- Thin English pages made only to capture search traffic.
- Coin or news modules that imply buy/sell/hold recommendations.

## Execution Gate For Page Redesign PRs

Before any page family is marked redesigned:

- [ ] It uses the governed TP mark and token family.
- [ ] It has RTL and LTR behavior documented or scoped.
- [ ] It has loading, empty, error and stale states where data is dynamic.
- [ ] It passes visible focus and keyboard navigation checks.
- [ ] It has SEO/GEO/AEO metadata and visible answer/source blocks where relevant.
- [ ] It connects to related coin/news/tool/lesson entities when the content contract requires it.
- [ ] It has mobile checks at 375px and desktop checks at 1440px.
- [ ] It avoids financial-advice wording and hype labels.
- [ ] It cites the relevant row in `docs/architecture/TECPEY_ORGANIC_GROWTH_ROUTE_INVENTORY.md`.
