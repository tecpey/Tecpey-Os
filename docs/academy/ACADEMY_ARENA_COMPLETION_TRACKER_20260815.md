# TecPey Academy, Arena and Mentor Completion Tracker

Date: 2026-08-15
Owner scope: Academy, Arena, Mentor, credentials, public profile consent, league evidence and QA.

This tracker keeps the 14 follow-up items from being treated as complete until
each one has product code, persistence, policy, tests, API/security evidence and
launch truth aligned. A merged foundation is not enough by itself.

## Status Legend

- Complete: implemented, merged, tested, and product-true.
- Partial: important foundation exists, but runtime workflow, API, automation,
  product activation, or evidence is incomplete.
- Gated: intentionally disabled or approval-required; not a launchable product
  claim until a later certified activation slice.

## Tracker

| # | Item | Current status | Completion requirement | Evidence required |
|---:|---|---|---|---|
| 1 | Immutable credential and medal ledger | Complete | Append-only credential records/events/visibility, identity-conflict replay handling, owner-scoped reads | Migration tests, credential authority tests, mutation-block triggers, API manifest delta |
| 2 | Repeatable monthly/seasonal issuance | Complete | A scheduled/idempotent issuer creates monthly and seasonal credentials from finalized snapshots without duplicates | Issuer worker, replay tests, scheduled evidence, notification evidence |
| 3 | Tenant/workspace isolation | Complete | Every participating table/read/write is tenant and workspace scoped, with cross-tenant negative tests | Tenant registry all proven, route guard tests, PostgreSQL A/B tests |
| 4 | Evidence digest and policy version | Complete | Every issued score, credential, snapshot and visibility event stores deterministic digest and policy version | Digest tests, migration checks, manifest evidence |
| 5 | Public profile visibility consent | Complete | Public surfaces expose only consented profile/credential evidence and never private student identifiers | Consent tests, public projection tests, no-store/strict route guards |
| 6 | Appeal, suspension and revocation lifecycle | Complete | Product/API workflow can open/resolve appeals, suspend, reinstate and revoke credentials safely | Lifecycle API tests, transition tests, admin/C-level audit evidence |
| 7 | Smart notifications for issuance, promotion and appeal | Complete | Durable domain notifications cover credential issue, promotion, suspension, appeal and revocation paths | Outbox producer tests, worker tests, privacy-minimized payload checks |
| 8 | Monthly league integration | Complete | Monthly league score, Arena score ledger, ranking snapshots and credential issuance form one governed loop | Integration test from score ledger to snapshot to credential |
| 9 | Arena free subscription entitlement | Complete: Arena Pro entitlement grants and notifications complete; cash reward remains C-level/compliance-gated and non-executable | Top-rank reward proposals produce idempotent Arena entitlement grants after appeal window and approval rules | Entitlement authority, expiry/replay tests, disabled cash-reward evidence |
| 10 | Snapshot and leaderboard | Complete | Refreshable monthly/yearly/lifetime snapshots and consent-bound leaderboard read API are merged and tested | PR #461/#462, materializer tests, cross-tenant leaderboard tests |
| 11 | Daily challenge for weak points | Complete | Weakness signals generate daily repair challenges and track completion with server authority | Daily scheduler, mastery signal tests, repair completion evidence |
| 12 | C-level controls and Mentor orchestration | Complete | Mentor can draft/recommend only; C-level/compliance approval controls rewards, publication and sensitive changes | Approval matrix, orchestration tests, explicit fail-closed gates |
| 13 | Growth-term content and exams | Complete | Post-Term-7/Term-8 mastery content has sourced modules, questions, grading and publication review | Content QA, question validity tests, mastery season review evidence |
| 14 | Complete mobile, RTL/LTR, accessibility QA | Partial: Academy/Arena/Mentor Playwright + axe matrix implemented; final browser execution pending in an environment with e2e dependencies/browsers | Public and authenticated Academy/Arena/Mentor flows pass mobile, RTL/LTR, keyboard and accessibility checks | Playwright/mobile screenshots, axe or equivalent checks, golden path CI |

## Execution Order

1. Close lifecycle gaps: items 6 and 7.
2. Close league-to-credential automation: items 2 and 8.
3. Close reward entitlement without enabling cash rewards: item 9.
4. Close daily repair loop and growth-term content: items 11 and 13.
5. Harden C-level/Mentor orchestration gates: item 12.
6. Run final UX/accessibility/mobile matrix: item 14.
7. Tenant isolation registry is now fully proven; keep the registry gate green
   for every future tenant-owned table.

## Product Truth Rule

Public rewards, cash payments, real-money exchange, custody, withdrawals,
enterprise activation and white-label activation remain outside launch scope
unless a separate certified activation slice explicitly changes that status.

## Progress Log

### 2026-08-15: Tenant/workspace isolation proof

Completed the remaining evidence gap for item 3:

- Added PostgreSQL adversarial proof for `academy_credential_records`.
- The test binds one student UUID to two tenants/workspaces, issues the same
  credential key in both, and verifies scoped cabinet/history reads.
- The test proves tenant B cannot change tenant A credential visibility or
  append tenant A lifecycle events by credential id.
- Updated the tenant-scoped table registry from 50 proven + 1 pending to all
  51 registered tables proven.

Validation:

- `NODE_PATH=src/tests/stubs NODE_ENV=test node --import tsx --test src/tests/security/academy-credential-cross-tenant-isolation-postgres.test.ts src/tests/credential-authority.test.ts`
- `node scripts/check-tenant-scoped-table-coverage.mjs`

### 2026-08-15: Academy/Arena/Mentor accessibility QA harness

Advanced item 14, but did not mark it complete until the browser matrix runs:

- Added a Playwright/axe spec covering Academy, Trading Arena and Mentor Coach
  in both FA RTL and EN LTR routes.
- The spec runs inside the existing four-project matrix:
  `chromium-fa-mobile`, `chromium-en-desktop`, `firefox-fa-desktop` and
  `firefox-en-mobile`.
- Each covered surface asserts localized `html lang/dir`, visible H1,
  horizontal overflow safety, keyboard focus reachability, primary target size,
  full-page screenshot attachment and no critical/serious axe violations.
- The FA Arena execution surface uses a deterministic API stub so the
  authenticated server-authority UI can be tested without live user data.
- Added `qa:academy-arena-mentor-a11y:check` so the evidence harness itself
  cannot silently disappear.
- Wired that evidence check into `.github/workflows/public-browser-golden-path.yml`
  before the production build and governed browser run.

Validation completed locally:

- `node --check tests/e2e/specs/academy-arena-mentor-accessibility.spec.mjs`
- `node --check tests/e2e/run-public-e2e.mjs`
- `node scripts/check-academy-arena-mentor-accessibility-evidence.mjs`
- `node --test tests/e2e/redis-rest-stub.test.mjs tests/e2e/process-lifecycle.test.mjs tests/e2e/redis-node-isolation.test.mjs`
- `./node_modules/.bin/tsc --noEmit`
- `git diff --check`

Blocked locally:

- Full `npm --prefix tests/e2e test` browser execution needs
  `tests/e2e/node_modules` and Playwright browsers; this sandbox has neither
  installed and network-backed npm installation was unavailable. The connected
  GitHub workflow installs those dependencies and is the correct place to
  produce final item 14 evidence.

### 2026-08-15: Credential lifecycle API and notifications

Completed backend/evidence slice for items 6 and 7:

- Added student appeal opening API: `POST /api/academy-credential-appeals`.
- Added Admin lifecycle API: `PATCH /api/command-center/academy-credentials/lifecycle`.
- Added governed lifecycle authority with exact tenant/workspace ownership,
  idempotent replay, conflict detection, policy version, evidence hash and
  notification outbox enqueue.
- Added durable notification producer support for
  `academy.credential_lifecycle_changed`.
- Added forward-only migration `0081_academy_credential_lifecycle_notification.sql`
  and updated the pinned migration plan hash.
- Added API security manifest delta, strict-revocation enrollment, bounded-body
  enrollment, tenant product gate enrollment and sensitive audit inventory.

Validation:

- `NODE_PATH=src/tests/stubs NODE_ENV=test node --import tsx --test src/tests/credential-authority.test.ts src/tests/credential-visibility-route.test.ts src/tests/notification-domain-producers.test.ts src/tests/database/migration-contract.test.ts`
- `node scripts/check-strict-revocation-authority.mjs`
- `node scripts/check-bounded-request-body-authority.mjs`
- `node scripts/api-security-manifest-reviewed-deltas.test.mjs`
- `node scripts/check-sensitive-mutation-audit-authority.mjs`
- `./node_modules/.bin/tsc --noEmit`

### 2026-08-15: Arena league credential issuance

Completed backend/evidence slice for items 2 and 8:

- Added replay-safe issuer authority for finalized monthly/yearly Arena league
  snapshots.
- Issuer creates `league_medal` credentials for top ranks using the immutable
  snapshot digest, ranking version, cutoff, rank, points, trade count,
  compliance score and tier as credential evidence.
- Added cohort suppression guard: official medals are not issued below the
  25-participant threshold.
- Added exact replay handling through the existing credential ledger, so a
  rerun counts replayed credentials and does not duplicate notification outbox
  handoff.
- Added scheduled/runtime command: `npm run arena:league:credentials`.

Validation:

- `NODE_PATH=src/tests/stubs NODE_ENV=test node --import tsx --test src/tests/monthly-league/arena-league-credential-issuer.test.ts src/tests/monthly-league/arena-league-ranking-materializer.test.ts src/tests/credential-authority.test.ts`
- `node scripts/check-academy-authority-boundary.mjs`
- `./node_modules/.bin/tsc --noEmit`

### 2026-08-15: C-level controls and Mentor orchestration

Completed authority/evidence slice for item 12:

- Added `c-level-control-v1` authority for sensitive approval evidence using
  the existing `admin_approval_requests` control-plane ledger.
- Controlled actions now include Mastery Season publication, Arena cash reward
  execution and sensitive credential lifecycle operations.
- Mastery Season publish now fails closed unless the generated draft has both
  Mentor governance evidence and a scoped approved C-level/compliance approval
  record.
- Reviewer role enforcement requires an allowed role such as `super_admin`,
  `compliance_approver` or, for cash execution approval only,
  `treasury_approver`.
- Command Center control matrix now marks Mastery Season control as configured
  with explicit publish-approval evidence.
- Cash reward execution remains non-executable; this slice adds the approval
  authority/gate, not a payment worker.

Validation:

- `NODE_PATH=src/tests/stubs NODE_ENV=test node --import tsx --test src/tests/security/c-level-control-authority.test.ts src/tests/product/mastery-seasons.test.ts src/tests/monthly-league/policy.test.ts`
- `./node_modules/.bin/tsc --noEmit`

### 2026-08-15: Lifecycle approval and entitlement notifications

Completed remaining backend/evidence gaps for items 2, 6, 7, 8 and 9:

- Admin credential lifecycle API now requires a scoped
  `cLevelApprovalRequestId` for sensitive actions and records that approval in
  the Admin audit event.
- Added `appendApprovedAcademyCredentialLifecycleEvent()` so suspend,
  reinstate, revoke and appeal resolution go through `c-level-control-v1`
  evidence before writing credential lifecycle history.
- Credential lifecycle notifications continue to cover suspension,
  reinstatement, revocation, appeal opening and appeal resolution.
- Added governed `academy.arena_pro_entitlement_granted` notification events
  for Arena Pro subscription grants.
- Arena Pro entitlement grants now enqueue notification outbox events only on
  new grants; exact replays do not duplicate notifications.
- Notification payloads remain privacy-minimized and explicitly record
  `cashExecutionEnabled: false`; no cash payment worker was added.

Validation:

- `NODE_PATH=src/tests/stubs NODE_ENV=test node --import tsx --test src/tests/credential-authority.test.ts src/tests/monthly-league/arena-league-entitlement-authority.test.ts src/tests/notification-domain-producers.test.ts src/tests/security/c-level-control-authority.test.ts`
- `node scripts/check-bounded-request-body-authority.mjs`
- `node scripts/check-strict-revocation-authority.mjs`
- `node scripts/check-academy-authority-boundary.mjs`
- `node scripts/check-disabled-capability-attestation.mjs`
- `./node_modules/.bin/tsc --noEmit`

### 2026-08-15: Arena Pro entitlement grants

Completed backend/evidence slice for item 9:

- Added append-only `academy_arena_entitlement_grants` migration for Arena Pro
  subscription grants.
- Added `arena-league-entitlement-v1` authority to grant top-rank Arena Pro
  days only after the seven-day appeal window has closed.
- Grant duration follows the monthly league reward proposal policy:
  rank 1 gets 90 days, ranks 2-3 get 60 days, ranks 4-10 get 30 days.
- Cash pool fields are recorded only as non-executable governance evidence:
  `cashExecutionEnabled: false`, with `cash_disposition` requiring
  C-level/compliance approval where applicable.
- Added active-entitlement lookup for Arena Pro.
- Added scheduled/runtime command: `npm run arena:league:entitlements`.

Validation:

- `NODE_PATH=src/tests/stubs NODE_ENV=test node --import tsx --test src/tests/monthly-league/arena-league-entitlement-authority.test.ts src/tests/monthly-league/arena-league-credential-issuer.test.ts src/tests/monthly-league/policy.test.ts src/tests/database/migration-contract.test.ts`
- `node scripts/check-tenant-scoped-table-coverage.mjs`
- `node scripts/check-database-migration-authority.mjs`
- `./node_modules/.bin/tsc --noEmit`

### 2026-08-15: Daily repair challenge and growth-term exams

Completed product/evidence slice for items 11 and 13:

- Added append-only `academy_daily_repair_challenges` and
  `academy_daily_repair_challenge_events` ledgers.
- Added `academy-daily-repair-v1` authority to select the latest scoped
  negative weakness signal and assign one deterministic repair challenge per
  learner/day.
- Added server-side grading for daily repair completion with exact
  idempotency replay and mismatch rejection.
- Added scheduled/runtime command: `npm run academy:daily-repair:assign`.
- Registered the new tenant-scoped tables and migration plan entry
  `0083_academy_daily_repair_challenges.sql`.
- Added explicit post-Term-7 growth content evidence: generated Mastery Season
  drafts must carry trusted HTTPS sources, at least six validated questions,
  advanced objectives and Mentor-governed publication review before catalog
  publishing.

Validation:

- `NODE_PATH=src/tests/stubs NODE_ENV=test node --import tsx --test src/tests/product/daily-repair-challenge-authority.test.ts src/tests/product/mastery-seasons.test.ts src/tests/database/migration-contract.test.ts src/tests/database/migration-integration.test.ts`
- `node scripts/check-tenant-scoped-table-coverage.mjs`
- `node scripts/check-database-migration-authority.mjs`
- `node scripts/check-academy-authority-boundary.mjs`
- `./node_modules/.bin/tsc --noEmit`
