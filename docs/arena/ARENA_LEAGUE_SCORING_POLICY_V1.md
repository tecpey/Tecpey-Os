# TecPey Arena League Scoring Policy v1

Status: governed scoring contract; persistence and league materialization remain fail-closed until their dedicated authorities are merged.

## Product principle

Every finalized simulated Arena trade may produce points, including negative points. Trade count, notional volume, deposited wealth, real-exchange PnL and raw leverage must never determine rank. The policy rewards repeatable decision quality and deliberately prevents activity farming and overtrading.

## Per-trade score

The deterministic score is clamped to `[-100, 100]` and records its policy version and reason codes.

- Activity: 10 points for the first three finalized trades of a UTC day, 5 for trades four and five, and 0 afterwards.
- Process: pre-trade plan, stop loss, completed journal, rule compliance, proper sizing and disciplined execution.
- Outcome: R-multiple contributes at most `+15` or `-15`; it is intentionally less important than process.
- Penalties: no stop loss, over-risk, impulse entry, revenge trading and FOMO.
- Monthly Arena contribution: clamped to `[-3000, 3000]` before normalization into the Academy monthly league.

## Instruments and multipliers

Instrument complexity never rewards risk-taking by itself.

| Instrument | Positive multiplier | Penalty multiplier | Gate |
|---|---:|---:|---|
| Spot | 1.00x | 1.00x | normal Arena controls |
| Perpetual | up to 1.05x | 1.20x | plan + stop loss + risk budget at most 2% |
| Options | up to 1.10x | 1.30x | plan + stop loss + risk budget at most 2% |

If the safety gate fails, the positive multiplier falls back to 1.00x while the higher penalty multiplier remains. Future instrument adapters must map to one of these governed categories and may not invent client-side coefficients.

## Ranking windows

- Monthly: finalized immutable snapshot used for prizes and monthly medals.
- Yearly: aggregation of finalized monthly snapshots; no mutable live totals become award evidence.
- Lifetime: aggregation of finalized snapshots for the all-time ranking and tier eligibility.

Public ranking requires explicit consent, minimum cohort privacy, no integrity hold and no open appeal. Private users may retain their points and tier without appearing publicly.

## Tiers

Progression is based on lifetime points, finalized-month experience and minimum rule compliance. The governed sequence is Rookie, Explorer, Analyst, Strategist, Elite, Master and Legend. Points alone cannot promote a user when discipline or experience gates fail.

## Anti-abuse and safety invariants

- A replayed trade-close event must replay the exact same score, never create a second score.
- Score records and finalized snapshots are append-only.
- Client-provided points, multipliers, rank and tier are untrusted and ignored.
- Corrections use compensating events with evidence; rows are never edited or deleted.
- Cash prizes remain behind C-level and compliance approval.
- League placement is educational competition, not financial advice or a promise of profit.
