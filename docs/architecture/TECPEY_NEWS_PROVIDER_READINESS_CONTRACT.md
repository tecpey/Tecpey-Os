# TecPey News Provider Readiness Contract

Status: authority foundation
Policy version: `tecpey-news-provider-readiness-v1`
Scope: provider onboarding for news, market data, social signals, source cards, Academy grounding and materialized discovery surfaces.

## Purpose

TecPey must not treat every feed, API, social post or scraped article as equal. Provider readiness is the upstream gate before News Intelligence, daily coin discovery, Academy quiz grounding, Mentor context and Trading Arena explainers can rely on external data.

The first implementation lives in `src/lib/news-provider-readiness.ts`. It is deterministic and does not call live providers in CI. Live adapters must map their real contracts, keys and operational evidence into this authority before ingestion is enabled.

## Required Evidence

Every provider needs:

| Evidence | Required Standard |
| --- | --- |
| Identity | Stable provider id, name and domain |
| Use case | News, market data, official primary source, social signal, media or Academy grounding |
| Trust | Minimum score of 0.70 for automated ingestion |
| Rights | Public summary, Persian editorial use and redistribution policy |
| Media | Licensed, official-attribution or TecPey-generated thumbnails only |
| Financial use | Explicit allowance for market/news use cases |
| Privacy | Reviewed retention/privacy posture |
| Terms | Review date and TecPey owner |
| Operations | Retention window, rate limit, supported regions and fallback providers |
| Continuity | Critical providers need a fallback for news or market-data use cases |

## Readiness States

| Status | Meaning |
| --- | --- |
| `ready` | Provider can feed automated ingestion and materialization |
| `degraded` | Provider is useful but cannot auto-ingest until fallback/SLA/retention/rate issues are fixed |
| `blocked` | Provider must not create public summaries, Persian editorial output or automated ranking input |

Social signals are supporting evidence only. They may help explain attention and sentiment, but they must not be the sole source for publication, listing, market claims or trading-related content.

## Catalog Coverage

The initial catalog covers:

- institutional news and market-data sources for continuity;
- trusted crypto media for narrative discovery;
- official primary sources for sensitive claims;
- manual social-signal evidence that remains blocked from auto-publication.

The catalog intentionally separates provider readiness from source-card quality. A ready provider still needs the News Intelligence Graph gates: HTTPS canonical URL, Persian summary quality, duplicate checks, thumbnail rights, entity links, non-advice language and TecPey AI Council sign-off.

## Downstream Rules

- `NewsIntelligenceSource.providerReadiness.autoIngestionAllowed` must be true before auto-publication.
- `provider_not_enterprise_ready` is a hard News Intelligence rejection reason.
- Daily coin discovery can use provider-backed evidence only while keeping `exchangeEnabled: false`.
- Live adapters must not bypass this authority by writing directly to materialized snapshots.
