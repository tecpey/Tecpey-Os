# Release: exact-SHA Staging promotion + rollback evidence

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** Program Map only.

## Global quality bar

Every implementation under this program is governed by the following non-negotiable rules:

- **Authority first:** security-, entitlement-, identity-, mastery-, rank-, payment- and personalization-sensitive state is server-owned, tenant-bound and fail-closed. Client state can render authority but cannot create it.
- **No fabricated intelligence:** no synthetic mastery, risk, rank, subscription, confidence, live market value or AI capability may be presented as fact without a named authority and freshness/provenance.
- **Design:** content-first hierarchy. Translucent/glass treatment is reserved for navigation, controls and lightweight overlays; never glass-on-glass or decorative transparency that competes with content.
- **Accessibility:** WCAG 2.2 AA minimum, 44px preferred primary touch targets, visible keyboard focus, no focus obscured by sticky UI, semantic landmarks, reduced-motion and reduced-transparency-safe behavior, screen-reader states for loading/error/degraded/locked.
- **Localization:** FA/EN parity in the same PR, correct RTL/LTR semantics, logical CSS properties, bidi isolation for identifiers/numbers, no English-only operational dead ends.
- **Security:** strict schema validation, bounded payloads, CSRF for mutations, rate limiting, tenant/workspace authorization, session/revocation checks, idempotency/replay defense, audit trail and negative tests.
- **Privacy:** data minimization; self-reported notes never silently become inferred traits; sensitive profile changes require explicit authority and user-facing explanation.
- **Observability:** structured logs, correlation IDs, explicit degraded modes, freshness timestamps, provider/authority reason codes and bounded telemetry.
- **Testing:** TypeScript, ESLint, unit, integration, negative/security tests, repository audit classification, public browser golden path, mobile/desktop FA/EN evidence, exact-head CI.
- **Release:** immutable exact-SHA artifact, staging-first, health + smoke + rollback proof, Production untouched until a separate explicit release decision.

### Research anchors

This program is informed by current primary guidance: Apple Liquid Glass/HIG content-first hierarchy and reduced motion/transparency; WCAG 2.2 focus/target criteria; Rive Data Binding/ViewModel/MVVM; current OpenAI Responses web-search/citation patterns; Anthropic citation-enabled web search with dynamic filtering; xAI Web/X Search; and evidence on spacing + retrieval practice for durable learning. External provider names/models remain registry data, not hard-coded product architecture.


## Objective

Eliminate fragile manual release steps while preserving the existing protected staging authority. Add a governed, auditable exact-main-SHA promotion path for `tecp.ir` that never touches Production.

## Deliverables

- Manual protected workflow accepting only a 40-char commit that is proven to be an ancestor/member of current `main`.
- Resolve signed immutable container release artifact for that exact SHA; verify provenance/attestation before host mutation.
- Protected `staging` environment + approved self-hosted runner only.
- Preflight: runtime versions, disk, service/unit state, env-file permissions, DB/Redis connectivity, migration authority, current release SHA.
- Backup manifest capturing prior immutable release path, service unit/drop-in hashes and health snapshot.
- Atomic promotion to `/srv/tecpey/releases/<SHA>`; no moving source checkout.
- Build/launch identity must expose exact SHA in `/api/health`.
- Bounded migrations with lock/idempotency proof.
- Restart only staging service/unit set.
- Automatic rollback on failed health/smoke within bounded window.
- Smoke matrix: FA/EN landing, login, Academy, Profile/Living Identity, Account/Pro capability map, Mentor, Market Intelligence, Arena entry, notifications shell.
- Safari/PWA/reduced-motion browser evidence.
- Upload signed JSON evidence: previous SHA, target SHA, digest, health, migration count, smoke results, rollback readiness, timestamps.
- Production hostnames/services/secrets must be unaddressable from this workflow.

## Negative tests

- reject non-main SHA;
- reject missing/invalid image attestation;
- reject symlink/mutable release directory;
- reject health commit mismatch;
- reject dirty checkout;
- reject environment file with unsafe permissions;
- prove rollback restores prior service working directory and health;
- prove no production service name/path is referenced.

## Acceptance

A successful run leaves staging reporting the target SHA and all smoke probes green. A forced smoke failure proves rollback to the prior SHA without manual repair.


## Delivery discipline

This Draft PR starts as an implementation contract. Code, migrations, tests and evidence are added to this same branch; the PR does not become Ready until every acceptance criterion above is either implemented or explicitly split into a named follow-up PR. Scope reductions must be documented in the PR body; they may not be silently dropped.

## Release boundary

No merge, Staging mutation or Production mutation is authorized merely by opening this Draft PR.
