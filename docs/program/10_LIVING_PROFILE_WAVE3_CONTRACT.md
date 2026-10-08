# Living Profile Wave 3: journey, league, achievements + identity state

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** Identity/Auth/KYC, Academy v2 and Arena/League v2 authorities. Pro authority enriches but is not required for the base profile.

## Global quality bar

- Authority-sensitive state is server-owned, tenant-bound and fail-closed; clients cannot create entitlement, identity, mastery, rank or safety truth.
- No fabricated intelligence without named authority + provenance/freshness.
- Content-first design; glass only for navigation/controls/light overlays; no glass-on-glass.
- WCAG 2.2 AA minimum, 44px preferred primary targets, visible focus, no focus obscuration, reduced-motion/transparency-safe behavior.
- FA/EN parity, RTL/LTR correctness, logical CSS and bidi isolation.
- Schema validation, CSRF/rate limits, session/tenant checks, idempotency/replay defense, audit logs and negative tests.
- Structured logs, explicit degraded states, authority reason codes and freshness timestamps.
- TypeScript, ESLint, unit/integration/security/browser tests, repository audit and exact-head CI.
- Immutable exact-SHA staging-first release with rollback proof; Production requires separate explicit approval.


## Objective
Complete the Living Profile as the user's trusted operating summary: Identity + Growth + Companion.

## Deliverables
- Journey timeline from real events only: onboarding, term milestones, assessments, credentials, Arena seasons/challenges and verified achievements.
- League Intelligence with current season, governed rank/neighborhood and movement only across comparable snapshots.
- Achievement Cabinet respects issued certificate/achievement status, expiry/revocation and verification links/QR.
- Identity/KYC status stays private and shows next action without leaking legal identity to public profile.
- Next Best Action resolver combines current term, due reviews, Arena challenge, research follow-up and verification tasks via explicit priority policy.
- Growth Orbit evolves only from named governed dimensions; no opaque aggregate Growth Score.
- Pro state comes from server entitlement and distinguishes guest/locked/unavailable/entitled.
- Privacy panel clearly separates self-reported vs observed vs derived data and offers governed reset/disable routes where supported.
- Journey filters/deep links back to source activity.
- Exportable personal progress summary excludes internal-risk/private metadata by default.
- Mobile prioritizes Today/Next Action; desktop exposes richer journey/history.

## Acceptance
Every rank/badge/milestone links to an authority/source event. Missing or stale authority yields explicit unknown/degraded state, never optimistic cached truth.

## Delivery discipline
This Draft PR begins as an implementation contract. Code, migrations, tests and evidence are added to this same branch. It cannot become Ready until each acceptance item is implemented or explicitly split into a named follow-up PR.

## Release boundary
Opening this PR authorizes no merge, Staging mutation or Production mutation.
