# TecPey Global Platform, Localization, and Growth Architecture

## Purpose

Define a safe, incremental path from TecPey's Persian-first product to a genuinely multilingual financial-education and digital-asset platform. This document is an implementation contract for follow-up pull requests, not a claim that the proposed work is already shipped.

## Product and brand direction

- Preserve TecPey's Persian-first soft-launch focus while making the architecture locale-extensible.
- Treat TecPey as a financial education and trading-practice operating system: Academy, virtual Trading Arena, AI Mentor, market intelligence, and only explicitly launch-gated exchange capabilities.
- Keep the brand system consistent across locales while adapting language, typography, layout direction, terminology, market hours, currencies, disclosures, and support information to each region.
- Avoid presenting any real-money, custody, or exchange capability as available until its existing launch gates and operational evidence permit it.

## Domain strategy: decision gate

- Keep `tecpey.ir` as the current canonical host until ownership, control, legal fit, DNS/TLS, email, analytics, and migration readiness for `tecpey.com` have been verified.
- Do not change canonical URLs, JSON-LD IDs, Open Graph URLs, sitemap hosts, redirects, or internal links solely because a .com domain is attractive.
- If TecPey controls `tecpey.com` and approves the migration, use a documented migration plan: verify domain control, inventory indexed URLs, map one-to-one redirects, update canonical and alternate-language references, submit sitemaps, monitor Search Console, and preserve rollback.
- Avoid publishing duplicate indexable copies on both domains. Select one canonical host and use permanent redirects for equivalent pages after an approved migration.
- A .com domain is a useful global brand signal and memorable address, but it does not by itself establish international reach, compliance, or search visibility.

## Locale architecture

- Treat locale support as a product capability, not a translated navigation layer.
- Keep locale-specific URLs stable and crawlable. For each translated page, provide a self-referencing canonical and correct alternate-language links for every available equivalent, including an appropriate `x-default` only where a true language-selection fallback exists.
- Generate locale metadata, JSON-LD, sitemap entries, titles, descriptions, image alt text, and internal links from the same canonical content record to reduce drift.
- Never redirect solely on inferred IP location. Offer an explicit language/region switch and remember the user's choice according to the existing consent and persistence rules.
- Keep right-to-left layout, Persian number/date rendering, currency formatting, screen-reader labels, and locale-specific typography covered by acceptance tests.
- Expand languages in stages based on editorial capacity, user demand, search demand, legal feasibility, and support coverage. Do not declare a language "supported" until key journeys and core content are translated and QA-reviewed.

## Multilingual editorial and publication pipeline

Use a governed content lifecycle:

1. Discover: collect market events and candidate topics from approved sources, preserving source URL, publication time, locale, and retrieval time.
2. Cluster: deduplicate syndicated and near-duplicate reports; separate primary-source evidence, corroboration, commentary, and social signals.
3. Research: identify factual claims, source each material claim, capture disagreements and uncertainty, and flag financial-risk or legal sensitivity.
4. Draft: create a source-language editorial brief, then localize for each enabled locale rather than performing literal translation alone.
5. Validate: check factual citations, freshness, terminology, language quality, locale-specific metadata, structured data, canonical/alternate links, risk disclosures, and duplicate-content risk.
6. Review: require human editorial approval for material market-moving, investment-related, legal, or sensitive claims. AI may assist but must not self-approve high-impact content.
7. Publish: use idempotent jobs, explicit publication states, per-locale readiness, retry limits, audit records, and a rollback/unpublish path.
8. Measure: monitor indexed coverage, useful organic visits, engagement, correction rate, stale-content rate, translation defects, and conversion quality by locale.

Automation must not create large volumes of near-identical translated pages merely to target search variations. Each published locale version must offer useful, accurate, natural content for that audience. Content generation and publication are separate permissions.

## Marketing and management operating model

Build toward one governed marketing command center with separate capabilities for:

- Editorial calendar, content briefs, localization queue, review and approval status.
- Campaign planning, UTM conventions, channel-specific copy, asset variants, and scheduled distribution.
- Search performance, technical SEO, crawl/index coverage, structured-data validation, and content freshness.
- Community and social publishing queues with platform-specific length, tone, and disclosure rules.
- Experiment definitions, audience/locale segmentation, conversion events, and measured results.
- Incident controls: pause publication, pause a campaign, retract content, and notify responsible operators.

Use role-based access, audit logs, idempotency, rate limits, provider budgets, secret isolation, and an explicit kill switch. The system must not silently publish or spend money when credentials, sources, locale quality, or approvals are missing.

## Motion and visual-quality rollout

- Audit existing motion and route behavior before adding another scroll engine. The repository already contains a TecPey scroll-motion background, design tokens, and reduced-motion checks; reuse and extend these rather than duplicating them.
- Pilot Lenis only on a small allowlist of public, content-oriented routes. Do not enable it globally across trading, charting, admin, dialogs, nested scroll regions, or other precision-sensitive workflows.
- Use one coordinated requestAnimationFrame loop if GSAP ScrollTrigger is introduced alongside Lenis; refresh and clean up ScrollTrigger instances correctly on route changes.
- Add GSAP for purposeful, scoped sequences (hero/story reveal, content entry, and restrained transitions), not perpetual motion or animation of rapidly changing market values.
- Use React Bits as a source of individually reviewed components, copying and adapting only selected components. Validate dependency footprint, licensing, accessibility, reduced-motion behavior, mobile layout, RTL, and the existing design-token system.
- Preserve native anchor navigation, keyboard focus, browser back/forward behavior, sticky elements, and touch scrolling. Disable or simplify motion for `prefers-reduced-motion`, data-saving, hidden tabs, and low-capability devices where appropriate.

## Delivery sequence and acceptance criteria

### Stage 0 — verify the baseline
- Confirm the actual canonical domain and domain-control status; do not infer ownership from a URL.
- Map existing locale routing, dictionaries, metadata, sitemap/robots behavior, content automation states, publication approvals, and route-specific motion.
- Record baseline mobile performance, accessibility, and route-level test results.

### Stage 1 — isolated visual pilot
- Add exact, reviewed dependencies and a reproducible lockfile update.
- Scope smooth scrolling to an allowlist of public landing/content routes.
- Implement one premium landing-page story sequence and one adapted component sourced from React Bits.
- Pass lint, typecheck, relevant UI/motion tests, locale-parity tests, production build, and manual mobile/desktop reduced-motion checks.
- Keep the change in a pull request; do not merge or deploy automatically.

### Stage 2 — international SEO and content quality
- Verify per-locale canonical and alternate links, sitemap coverage, metadata, schema, and page parity.
- Extend locale support through content models and validation rather than duplicating route implementations.
- Add editorial quality and publication-state gates before expanding automated distribution.

### Stage 3 — marketing automation
- Connect approved analytics and publishing providers only after access, budget, and permission boundaries are explicit.
- Introduce per-channel approval, per-locale readiness, idempotent scheduling, audit trails, and a global pause mechanism.
- Roll out one channel and one locale at a time, with measurable acceptance criteria.

### Stage 4 — measured expansion
- Expand markets and languages only when product support, editorial review, localization QA, compliance, and analytics can sustain them.
- Review quality and business outcomes before increasing automation volume.

## Non-goals

- No automatic domain migration.
- No mass machine-translated publishing without editorial validation.
- No unapproved paid advertising, social posting, production deployment, merge, or activation of real-money exchange/custody functionality.
- No global smooth scrolling that compromises the Arena, charting, accessibility, or mobile experience.
