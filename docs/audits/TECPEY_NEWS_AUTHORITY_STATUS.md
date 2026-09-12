# TecPey News Authority Status — 2026-09-12

## Current finding

Staging evidence showed a split-brain authority condition:

- Capture registry recognizes current governed sources such as The Defiant, Chainalysis, Bitcoin Optech and the U.S. SEC.
- Legacy News Automation and News Intelligence publication authorities still carry older source catalogs.
- This can classify a registry-known source as unapproved/unauthorized and collapse Persian publication output even when capture and translation are healthy.

## PR #640 implementation state

The branch now contains three explicit authorities:

1. `news-source-authority.ts` — registry-backed source identity and publication disposition.
2. `news-entity-resolution.ts` — deterministic project/network/exchange/regulator resolution without promoting generic topics into fake entities.
3. `news-governed-pipeline.ts` — a shadow pipeline that runs the existing automation/materialization logic through the new source and entity authorities without switching production/staging runtime imports yet.

The shadow pipeline is intentionally fail-closed:

- unknown source => rejected;
- quarantined source => rejected;
- registry-known source with incomplete provider readiness => human review;
- ready source => existing publication gates still apply;
- SEO/Organic Growth readiness cannot override publication authority;
- topic-only matching does not satisfy the entity gate.

## Acceptance fixtures

The exact-head tests cover:

- The Defiant: known source, not `source_not_authorized`, remains human-review until provider readiness is complete;
- Chainalysis: same policy, with OFAC entity resolution;
- CoinDesk: preserves auto-publication eligibility when normal safety/content gates pass;
- unknown domains: remain rejected;
- project/network resolution: Curve, Resupply and Base;
- topic-only content: Organic Growth may be ready while publication stays review-bound.

## Runtime boundary

No runtime worker import has been switched in this phase. This is deliberate: first exact-head TypeScript/lint/tests must prove the shadow authority is internally consistent. Runtime wiring is the next bounded change after green evidence.

No merge, deploy, timer activation, provider activation, production change or financial activation is authorized by this document.