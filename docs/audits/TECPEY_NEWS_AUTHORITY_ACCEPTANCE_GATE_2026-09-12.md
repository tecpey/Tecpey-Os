# TecPey News Authority Acceptance Gate — 2026-09-12

PR #640 must remain Draft until all conditions below are proven on the exact head.

## Source authority

- Capture source identity is derived from `NEWS_SOURCE_REGISTRY`.
- The Defiant, Chainalysis, Bitcoin Optech and U.S. SEC are never mislabeled as unknown solely because a legacy publication catalog drifted.
- Unknown domains remain fail-closed.
- Quarantined sources remain fail-closed.
- Registry-known sources without complete provider publication readiness remain `human_review`; they must not auto-publish and must not be mislabeled `source_not_authorized`.

## Entity authority

- Project/network/exchange/regulator resolution is deterministic and identity-based.
- Required fixtures include Curve, Resupply, Base, Chainlink, OFAC, Moonwell, Bitwise and Lighter.
- Generic topics such as DeFi, payments or regulation are not promoted into fake entities.
- `missing_entities` is removed only when at least one real entity is resolved.

## Publication authority

- Organic Growth/SEO readiness cannot override publication readiness.
- Provider-readiness incompleteness is review-bound, not silently auto-approved.
- Financial-advice, hype, invalid URL/time, duplicate and blocked-rights gates stay fail-closed.
- Governed snapshot aggregate counts are calculated from governed automation statuses, not stale legacy statuses.

## Evidence

- exact-head TypeScript green;
- exact-head ESLint green;
- governed News tests green;
- existing market/news/content-growth suite green;
- repository audit manifest green with every new source path explicitly classified;
- no new unresolved review thread;
- mergeability true;
- head/base unchanged during final evidence capture.

## Runtime transition

The new authority first runs as a shadow pipeline. Runtime worker imports may be switched only after the exact-head gate above is green. A staging canary requires a separate explicit deploy authorization and must prove non-zero valid Persian publishability without relaxing unknown-source or safety gates.

No production deployment or production mutation is authorized.