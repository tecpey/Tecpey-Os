# TecPey News Intelligence Graph Contract

Status: authority foundation
Policy version: `tecpey-news-intelligence-graph-v1`
Scope: public news intelligence, daily coin discovery, tool/coin/news relation graph, Academy/Mentor/Arena context enrichment.

## Product Intent

TecPey news automation is not a generic article generator. It is an intelligence pipeline that turns trusted global sources into Persian-first, source-linked, non-advisory market education. Every public news item must carry source authority, duplicate detection, Persian editorial quality, tag/entity graph links, and TecPey AI Council approval evidence before publication.

The first implementation lives in `src/lib/news-intelligence-graph.ts` and is intentionally deterministic so CI can prove the contract without calling external providers.

## Required Source Card

Each candidate news item must produce a dedicated source card with:

| Field | Requirement |
|---|---|
| Original source | Exact provider/source name |
| Original link | HTTPS canonical URL |
| Source URL | HTTPS source URL used by the ingestion job |
| Thumbnail | Licensed, official-attribution, or TecPey-generated only |
| Thumbnail attribution | Required when provider/source requires attribution |
| Persian summary | Accurate Persian summary, not direct machine-looking filler |
| Original language | Usually English, but recorded explicitly |
| Social layer | Verified social evidence or an explicit note that none was attached |

Blocked thumbnail rights, non-HTTPS URLs, weak/unapproved sources, missing Persian summary, exact duplicates, trading signals, and profit promises are hard rejection gates.

## Source Authority Tiers

| Tier | Examples | Role |
|---|---|---|
| `institutional_data` | CoinDesk Data API, Kaiko/Messari-style market data contracts | High-trust structured data and market context |
| `official_primary` | Project blogs, protocol docs, exchange/regulator announcements | Final authority for sensitive claims |
| `trusted_media` | Benzinga, The Block, Decrypt, Cointelegraph-style providers | News discovery and narrative context |
| `social_signal` | Verified X/Telegram/Reddit/YouTube/forum sources | Secondary attention/sentiment evidence only |
| `watchlist` | Unknown or low-evidence sources | Never auto-publish |

Provider onboarding must verify rights, region availability, redistribution limits, rate limits, retention/privacy terms, and financial-use permissions before enabling live ingestion.

## Dedupe and Story Chain

The graph authority creates a stable fingerprint from canonical URL, normalized title, publication day, and entity IDs. It blocks exact duplicates by canonical URL or fingerprint, and sends near-duplicates to human review while adding a `same_story_chain` edge.

This prevents repeated publication of the same story while preserving the ability to build a timeline such as:

1. Rumor or early signal
2. Official confirmation
3. Market reaction
4. Risk/Academy explainer
5. Coin page timeline update

## Tag and Entity Graph

Each accepted dossier emits graph edges for:

| Edge | Meaning |
|---|---|
| `sourced_from` | News source authority |
| `time_bucket` | Day/month grouping |
| `tagged_as` | Topic taxonomy |
| `mentions_coin` | Coin page relation |
| `mentions_tool` | Tool page relation |
| `mentions_project` | Project/ecosystem relation |
| `mentions_network` | Chain/network relation |
| `mentions_exchange` | Exchange/platform relation |
| `mentions_regulator` | Regulation/legal relation |
| `related_lesson` | Academy learning path |
| `same_story_chain` | Near-duplicate/story continuation |

This is the foundation for the future TecPey Intelligence Graph consumed by News, Coins, Tools, Academy, Mentor, and Trading Arena.

## TecPey AI Council Approval

Every candidate receives independent deterministic signoff fields for these roles:

| Role | Responsibility |
|---|---|
| `chief_data_officer_ai` | Source trust, canonical URL, duplicate status, lineage |
| `chief_market_intelligence_ai` | Market relevance, entity coverage, tags, trend value |
| `chief_risk_compliance_ai` | No trading signal, no profit promise, exchange disabled |
| `chief_editor_ai` | Persian summary quality, language clarity, source card readiness |
| `chief_academy_ai` | Learning context and related lesson path |
| `chief_product_ai` | Thumbnail/UX readiness and graph usability |

Auto-publication requires all reviews to sign off and zero gate reasons. Any soft issue becomes `human_review`; hard issues become `rejected`.

## Daily Coin Discovery

Coin discovery is educational by default. The graph can mark a coin as:

| Status | Meaning |
|---|---|
| `trending` | High-trust, high-confidence, socially visible educational trend |
| `educational_listed` | Safe to publish in coin directory as education/watch content |
| `watchlist` | Track but do not highlight strongly |
| `manual_review_required` | Risk/security/hype/low-confidence story needs owner review |

`exchangeEnabled` must remain `false` for every automated discovery. Exchange listing or trading enablement requires a separate manual authority path.

## Publication Rules

A news item can be public only when:

1. Source is approved and trust score is at least 0.70.
2. Canonical and source URLs are HTTPS.
3. Persian summary exists, is substantial, and contains Persian text.
4. At least one entity and at least two tags are present.
5. Thumbnail rights are licensed, official-attribution, or TecPey-generated.
6. Duplicate status is unique.
7. No direct buy/sell instruction, signal, guaranteed profit, or hype promise exists.
8. Academy context exists for deeper learning.
9. TecPey AI Council reviews all sign off.

## Materialization Bridge

The current materialization bridge stores dossier evidence in the existing snapshot JSON instead of introducing new tables in the same change. `materializeNewsAutomationDecisions` writes each item to `decisions[].intelligence`, including the source card, Persian summary, duplicate decision, graph edges, C-level reviews, tags, entities, time buckets, and safe coin discoveries.

`topCoins[].discovery` carries the daily coin discovery record needed by coin pages, while `exchangeEnabled` remains hard-coded to `false`. The existing persistence hash covers the enriched `decisions` payload, so idempotent replay and conflict detection also protect the intelligence evidence. A later migration can normalize these JSON records into dedicated dossier, edge, source-card, and coin-discovery tables.

## Integration Roadmap

1. Connect live provider adapters to this authority module.
2. Persist dossiers, graph edges, source cards, and coin discovery records in PostgreSQL.
3. Expose review queue for human owner decisions.
4. Render source cards in the News detail UI.
5. Render coin timelines and daily trending coins from graph output.
6. Feed approved graph context into Mentor and Academy news quizzes.
7. Add staging evidence workflow proving provider freshness, dedupe, source rights, and no exchange enablement.
