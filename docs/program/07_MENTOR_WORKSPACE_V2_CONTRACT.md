# Mentor Workspace v2: office, chat, actions + mini Arena

**Base main:** `96b56d0e469b356ccf8ee698c5a75a36d1cabe60`

**Dependencies:** Mentor Rive v2 contract; AI Model Lab/Council for advanced research; Pro authority for premium affordances.

## Global quality bar

- Authority-sensitive state is server-owned, tenant-bound and fail-closed; clients cannot create entitlement, identity, mastery, rank or safety truth.
- No fabricated intelligence without named authority + provenance/freshness.
- Content-first design; glass only for navigation/controls/light overlays; no glass-on-glass.
- WCAG 2.2 AA minimum, 44px preferred primary targets, visible focus, reduced-motion/transparency-safe behavior.
- FA/EN parity, RTL/LTR correctness, logical CSS, bidi isolation.
- Schema validation, CSRF/rate limits, session/tenant checks, idempotency/replay defense, audit logs and negative tests.
- Structured logs, reason codes, degraded states and exact freshness.
- TypeScript, ESLint, unit/integration/security/browser tests, repository audit and exact-head CI.
- Immutable exact-SHA staging-first release with rollback proof; Production requires separate explicit approval.

## Objective
Deliver the Mentor vision as a task-oriented learning workspace, not a decorative chat page.

## Desktop
- approximately 1/3 Mentor office, 2/3 chat/history/work surface;
- certificates/medals/cups use governed achievement authority;
- entitlement controls premium monitor/research affordances;
- host-owned states for desk/research/chat/Arena coaching;
- mini Arena opens/minimizes without leaving Mentor context.

## Mobile
- chat is primary;
- compact Mentor presence never blocks keyboard/bottom nav;
- mini Arena adapts to sheet/fullscreen;
- history/new-chat/Pro/privacy/support remain reachable with one-hand targets.

## Governed actions
Current-news/research, sourced market context, Arena challenges, Academy remediation and governed evidence summaries. Never direct trade execution; never claim pattern detection without evidence.

## Trust + acceptance
Visible sources/freshness, explicit Pro lock reason, true empty/degraded states, privacy deep link, FA/EN, keyboard/reduced-motion evidence. Every action requires an authority, degraded state and negative test.

## Delivery discipline
This Draft PR begins as an implementation contract. Code, migrations, tests and evidence are added to this same branch. It cannot become Ready until every acceptance item is implemented or explicitly split into a named follow-up.

## Named follow-ups accepted for Ready

The following boundaries require independent authority or runtime evidence and are deliberately tracked outside the Workspace shell implementation. Splitting them does not weaken their acceptance bar and does not authorize the corresponding capability before its own evidence closes.

- **#702 — Mentor Rive v2:** keep the renderer fail-closed until a genuine signed/exported `.riv` asset, governed manifest/digest and runtime acceptance exist. #703 must not simulate Rive activation or substitute a placeholder asset.
- **#736 — governed source-backed news brief and freshness authority:** owns the usable news-brief trigger/review flow, server provenance/freshness schema, entitlement boundary and negative evidence. Until it closes, #703 may expose only the existing unverified-source disclosure and must not claim verified-current news.
- **#737 — server-authoritative personalized Arena challenge integration:** owns challenge issue/version identity, user/tenant binding, provenance, replay/revocation/concurrency evidence and degraded states. The generic Mini-Arena practice checklist in #703 is presentation, not proof of a server-issued personalized challenge.
- **#738 — physical-device WCAG and keyboard acceptance:** owns manual/physical-device, software-keyboard, focus-not-obscured, screen-reader, contrast, forced-colors and supported viewport evidence that automated checks alone cannot prove.
- **#739 — exact-candidate staging and rollback evidence:** owns immutable candidate promotion, staging runtime smoke/RLS evidence and rollback proof after a reviewed exact SHA is selected. It grants no deployment authority by itself.

### #703 Ready boundary

Subject to a green exact-head gate and independent review of that same head, #703 can become Ready when the Workspace implementation itself remains internally complete: conversation-first hierarchy, responsive office disclosure, history/new-chat behavior, privacy and support access, server-authoritative entitlement/degraded presentation, Mini-Arena shell/recovery behavior, FA/EN parity, RTL/LTR correctness, automated keyboard/focus/reduced-motion/forced-colors evidence, and no unresolved inline review finding.

Ready status for #703 means only that this Workspace implementation slice is review-complete under the boundaries above. It does **not** assert completion of #702/#736/#737/#738/#739, verified-current news, personalized challenge authority, complete WCAG conformance, Staging acceptance, Production readiness or a Go decision.

## Release boundary
Opening or marking this PR Ready authorizes no merge, Staging mutation or Production mutation.
