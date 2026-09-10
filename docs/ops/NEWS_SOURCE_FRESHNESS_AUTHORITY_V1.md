# News Source Freshness Authority v1

## Purpose

Prevent transport-success or an empty bootstrap from being interpreted as evidence of source continuity.

## Evidence that triggered this authority

On staging at commit `37af285ea7cf575117c9b454398c782648c901e6`, the Blockworks endpoint `https://blockworks.com/feed` returned HTTP 200 and valid Atom XML, but all 50 entries were stale. The newest entry was published at `2026-01-07T14:00:00.000Z` when observed on `2026-09-10`. TecPey's archive acceptance policy rejects news older than 35 days, so the capture worker correctly accepted zero Blockworks articles.

The previous continuity classifier returned `bootstrap` when no previous archive head existed before checking whether the accepted article count was zero. Because `bootstrap` was not a risk state, a run could report `continuity_observed` even while one source had never produced an accepted article.

## Policy

1. A source with no previous archive head and zero accepted articles is `bootstrap_empty`, which is a continuity risk.
2. Existing sources with zero accepted articles remain `empty_feed`, also a continuity risk.
3. Existing sources must replay at least one accepted article to establish `proven_overlap`; otherwise continuity is `continuity_unproven`.
4. Transport failure is always `source_failed`.
5. Sources with proven upstream-quality problems may be explicitly `quarantined`. They remain visible and may continue to be fetched for observation, but they do not participate in the required-source continuity quorum until the quarantine is intentionally removed.
6. Quarantine must be explicit in the source registry and carry a reason. It must not silently delete or replace a source.
7. `continuity_observed` is evidence only for the configured required-source set. It is not an absolute zero-loss guarantee for generic RSS/Atom feeds.

## Blockworks staging decision

Blockworks is temporarily marked `quarantined` because its official `/feed` endpoint is syntactically valid but stale. No unverified replacement feed is substituted. Its source definition remains in the registry so recovery or a future source-specific adapter can be evaluated deliberately.

## Activation rule

Do not enable the recurring capture timer until the exact PR head is green and a staging run proves:

- `aiCalls = 0`;
- all required sources have no continuity risk;
- Blockworks is reported as quarantined and excluded from the required-source quorum;
- replay runs remain idempotent;
- the legacy materialization timer remains inactive.
