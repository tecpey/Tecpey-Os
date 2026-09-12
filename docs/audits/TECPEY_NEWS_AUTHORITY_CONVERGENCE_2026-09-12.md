# TecPey News Authority Convergence — 2026-09-12

Base: `main@ac4c4b03e8cf2ba382dec69c6a729c318b186067`

## Observed staging failure

Persian materialization regressed from publishable output to `0 publishable / 105 needs_review` while translation continued producing completed rows. The repeated dossier reasons were `source_not_authorized` and `missing_entities`.

## Root cause isolated

TecPey currently has multiple source authorities with drift:

- `news-source-registry.ts` governs capture and already includes The Defiant, Chainalysis, Bitcoin Optech and SEC.
- `news-provider-readiness.ts` still has an older provider catalog and therefore reports some registry-known sources as blocked / not in catalog.
- `news-intelligence-graph.ts` owns publication gating and has an older explicit source list, so registry-known sources can be mislabeled `source_not_authorized`.

This PR begins convergence without weakening safety:

1. Capture registry is treated as canonical source identity.
2. Provider readiness remains a separate publication-rights/readiness authority.
3. Registry-known sources with missing readiness are `human_review`, not falsely `source_not_authorized` and not auto-published.
4. Unknown sources remain blocked.
5. Quarantined sources remain blocked.

## Follow-up wiring gate

Before this PR can become Ready, publication intelligence must consume the unified source authority and entity-resolution coverage must be extended beyond only coin/tool matches. Required canary coverage: The Defiant, Chainalysis, SEC and CoinDesk, with unknown-source fail-closed evidence.

No merge, deploy, timer activation, provider activation or production change is authorized by this PR.
