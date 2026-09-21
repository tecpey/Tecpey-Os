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

- Manual protected workflow accepting only a 40-char commit that is proven to be an ancestor/member of current `main`; non-monotonic promotion to an older main commit requires an explicit `allow_downgrade` opt-in.
- Resolve signed immutable container release artifact for that exact SHA; verify provenance/attestation before host mutation.
- Protected `staging` environment + approved self-hosted runner only.
- Preflight: runtime versions, disk, service/unit state, **private env-file permissions** (no world access, no group write/execute, no execute bits), DB/Redis connectivity, migration authority, current release SHA.
- Backup manifest capturing prior immutable release path, service unit/drop-in hashes and health snapshot.
- Atomic promotion to `/srv/tecpey/releases/<SHA>`; no moving source checkout.
- Build/launch identity must expose exact SHA in `/api/health`; the probe URL comes from protected `TECPEY_STAGING_HEALTH_URL` and is policy-limited to explicit loopback HTTP or HTTPS `tecp.ir/api/health`—never a hard-coded port, production hostname or arbitrary external URL.
- Bounded migrations with lock/idempotency proof.
- Restart only staging service/unit set.
- **Schema-aware failure policy:** before DDL, compare both (a) active health `migrations.planHash` vs target canonical `DATABASE_MIGRATION_PLAN_HASH`, and (b) the source delta against the governed migration-authority path registry. App rollback is safe only when plan hashes are equal **and** no migration-authority source changed.
  - If plan hashes match **and** the migration-authority delta is empty, failed cutover/health/smoke may automatically restore the previous app release and an optional rollback drill may prove previous→target round-trip.
  - If hashes differ **or migration-authority code changed**, the operator must additionally set explicit `allow_schema_change` authority before DDL. Without it, promotion stops before migration.
  - A non-monotonic downgrade is allowed only when explicitly requested **and** migration plan/authority is rollback-safe. A schema-changing downgrade is always rejected; an older migration authority is never executed against a newer schema.
  - Once an approved schema-changing cutover begins, previous-app rollback is forbidden after DDL. Any migration/cutover/health failure leaves staging stopped and requires a governed forward-fix or verified database restore under the recovery authority.
- Smoke matrix: FA/EN landing, login, Academy, Profile/Living Identity, Account/Pro capability map, Mentor, Market Intelligence, Arena entry, notifications shell. Same-origin verification is bound to the governed staging host **`tecp.ir`**, not merely “any HTTPS host that is not production”.
- Release workflow owns bounded HTTP FA/EN smoke only. Safari/PWA/reduced-motion and full visual/accessibility browser evidence are explicitly owned by #708 after the exact SHA is active on staging; #697 must not pretend curl smoke is browser acceptance.
- Upload redacted digest-verified JSON evidence: previous SHA, target SHA, signed/attested supply-chain image digest, previous/target migration plan hashes, migration rollback mode, previous/target health summaries, smoke results, unit backup digests, rollback disposition and timestamps. The evidence JSON itself is SHA-256 detached-digest verified; its supply-chain image identity is separately cryptographically signed/attested.
- Production hostnames/services/secrets must be unaddressable from this workflow.

## Negative tests

- reject non-main SHA;
- reject missing/invalid image attestation;
- reject symlink/mutable release directory;
- reject health commit mismatch;
- reject health probes aimed at production, arbitrary external hosts, wrong paths, credential-bearing URLs or unsafe loopback forms;
- reject dirty checkout;
- reject environment file with world permissions, group write/execute, execute bits, symlink/malformed state;
- reject unrelated HTTPS smoke origin;
- reject accidental downgrade to an older main release unless explicitly approved;
- reject **all** schema-changing downgrades even when downgrade is explicitly approved;
- reject schema-changing upgrades unless `allow_schema_change` is explicitly approved before DDL;
- prove rollback restores prior service working directory and health when migration plan hashes are equal;
- prove schema-plan drift **or migration-authority source drift**—including registry, readiness, plan and governance code—requires explicit schema authority and forbids rollback drill / previous-app rollback after DDL;
- prove a schema-changing failure leaves staging stopped with `forward_fix_or_restore_required`;
- prove no production service name/path is referenced.

## Acceptance

A successful run leaves staging reporting the target SHA and all governed HTTP smoke probes green. For a release with identical migration plan hash, a forced cutover/smoke failure proves rollback to the prior SHA without manual repair. For a release with a changed migration plan hash, tests prove that app rollback is refused and the failed staging service is halted pending forward-fix or verified restore. Full Safari/PWA/reduced-motion acceptance follows in #708 against the active exact SHA.


## Delivery discipline

This Draft PR starts as an implementation contract. Code, migrations, tests and evidence are added to this same branch; the PR does not become Ready until every acceptance criterion above is either implemented or explicitly split into a named follow-up PR. Scope reductions must be documented in the PR body; they may not be silently dropped.

## Release boundary

No merge, Staging mutation or Production mutation is authorized merely by opening this Draft PR.
