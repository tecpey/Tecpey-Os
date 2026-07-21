# Community Reputation Evidence Authority

Issue: #230  
Parent: #160  
Operational staging execution: #229

## Status

This document defines the first server-authoritative reputation foundation for TecPey Community.

The implemented policy is **Evidence-only**.

It provides:

- immutable evidence facts from finalized official Community challenges;
- deterministic provenance and integrity verification;
- tenant/workspace/principal isolation;
- a private authenticated summary for the evidence owner;
- a stable input boundary for future, separately approved ranking policies.

It does **not** provide:

- a reputation score;
- a public or private rank;
- a leaderboard position;
- XP or Badge issuance;
- scholarship or funded-account eligibility;
- financial reward eligibility;
- Mentor AI decisions;
- Instructor access, grants or decisions.

No score, rank or reward may be inferred merely from the existence of evidence records.

## Why Evidence precedes ranking

The legacy Community leaderboard computed browser-side scores from local Academy progress, Arena state and Journal completion, then mixed the user with deterministic demo peers. That model could not be authoritative because:

- browser state is mutable and device-specific;
- the scoring formula was not a versioned server policy;
- demo peers were not real participants;
- operational evidence and policy decisions were mixed together;
- no immutable provenance existed for later review or appeal;
- no tenant-safe server read model existed.

The legacy score and demo-peer generators are removed from active source. The remaining `community-leaderboard.ts` module contains presentation vocabulary and safety copy only.

## Authoritative source

Evidence v1 accepts one source type:

```text
official_journal_challenge_finalization
```

The source must be a terminal row in:

```text
academy_community_challenge_enrollments
```

The row must satisfy all existing official challenge invariants:

- `challenge_id = journal-reflection-week`;
- `challenge_version = journal-reflection-v1`;
- `status` is `completed` or `not_completed`;
- UTC ISO-week cycle identity and window are valid;
- finalization timestamp and provenance are present;
- `completed` exactly matches the minimum-three-trades and eighty-percent-reflection rule;
- `interactive` finalization has no worker run id;
- `worker` finalization has a valid run id;
- tenant/workspace/student principal binding is active.

No request body or browser value can create reputation evidence.

## Ledger

The append-only ledger is:

```text
academy_community_reputation_evidence
```

Each terminal enrollment has exactly one evidence row. The evidence row id and source enrollment id are the same UUID.

Evidence version:

```text
community-reputation-evidence-v1
```

Stored fields are limited to:

- tenant, workspace, principal type and principal identity;
- student identity;
- evidence version and source type;
- source enrollment identity;
- challenge id and challenge version;
- UTC ISO cycle key, start and end;
- terminal outcome;
- finalization timestamp;
- eligible closed-trade count;
- valid-reflection count;
- deterministic coverage basis points;
- completion-criteria boolean;
- finalization source and optional worker run id;
- canonical SHA-256 source digest;
- database recording timestamp.

The ledger contains no:

- raw PnL;
- order or trade details;
- reflection text;
- display name;
- email, phone or contact data;
- browser identifier;
- score or rank;
- reward decision;
- Mentor or Instructor decision.

## Atomic materialization

PostgreSQL owns materialization.

An `AFTER UPDATE` trigger on the challenge enrollment table runs when an enrollment changes from active to `completed` or `not_completed`.

Within the same database statement and transaction, the trigger:

1. verifies the active tenant/workspace/principal binding;
2. derives deterministic coverage basis points;
3. derives the completion criterion;
4. derives the canonical SHA-256 digest;
5. inserts the immutable evidence row;
6. reads the resulting row back;
7. verifies exact equality with the terminal enrollment;
8. raises an exception on any missing or conflicting field.

Therefore a new code path cannot successfully finalize an official challenge while silently omitting its reputation evidence.

Interactive completion and worker finalization use the same database authority. The application helper remains available for exact idempotent verification and controlled repairs, but it is not the primary enforcement mechanism.

## Backfill

Migration `0051_community_reputation_evidence.sql` backfills existing terminal pilot enrollments.

The backfill:

- selects only the official challenge id/version;
- accepts only terminal rows;
- derives all copied facts and the digest from the source row;
- uses the same insert validation trigger;
- is exact-idempotent on source enrollment identity;
- finishes with a fail-closed consistency check.

A conflicting historical row prevents migration completion. The migration must not overwrite or normalize a conflicting evidence record silently.

## Integrity rules

### Append-only

PostgreSQL rejects `UPDATE` and `DELETE` on every evidence row.

Correction is not mutation. A future correction model must use an explicitly versioned supersession event and migration, designed in a separate governed slice.

### Source equality

A `BEFORE INSERT` trigger verifies every copied identity, cycle, status, timestamp, count, criterion and finalization field against the referenced enrollment.

### Canonical digest

The SHA-256 digest covers a newline-separated canonical sequence containing:

- evidence version;
- source type;
- tenant/workspace/principal/student identities;
- source enrollment id;
- challenge and cycle identity;
- terminal outcome and finalization timestamp;
- counts and coverage basis points;
- completion criterion;
- finalization source and worker run id.

UTC timestamps use exact ISO-8601 millisecond precision. TypeScript recomputes the same digest whenever an evidence row is read.

### Deterministic coverage

Coverage uses integer basis points rather than floating-point score arithmetic:

```text
round_half_up(valid_reflections * 10000 / eligible_trades)
```

Examples:

- 0 / 0 = 0;
- 1 / 3 = 3333;
- 2 / 3 = 6667;
- 3 / 4 = 7500;
- 4 / 5 = 8000.

This value is evidence, not a reputation score.

## Private read model

Authenticated students read their own evidence summary from:

```text
GET /api/community/reputation-evidence
```

The route:

- accepts no query parameters;
- requires a strict-revocation canonical session;
- requires an Academy student profile;
- resolves the server-owned tenant/workspace/student context;
- requires scope `community:reputation:read`;
- joins evidence to an active principal binding;
- applies a bounded rate limit;
- returns `Cache-Control: private, no-store` and `Vary: Cookie`;
- fails closed when storage or authority is unavailable.

The API never accepts a student, tenant, workspace or enrollment id from the client.

## Summary contract

The summary reports only:

- evidence version;
- policy status `evidence_only`;
- finalized-cycle count;
- completed and not-completed cycle counts;
- total eligible trades and valid reflections;
- deterministic aggregate coverage basis points;
- first and latest finalization timestamps;
- latest immutable cycle evidence.

Decision fields are fixed:

```text
score = null
rank = null
rewardEligibility = false
mentorDecisionEligible = false
instructorDecisionEligible = false
```

The strict client parser recomputes aggregate coverage, validates counts and chronology, rejects unknown fields and rejects any response that attempts to activate those decision fields.

## UI boundary

Community Hub displays server evidence through `ReputationEvidencePanel`.

The panel may show:

- finalized-cycle count;
- completed-cycle count;
- aggregate reflection coverage;
- latest cycle outcome and counts.

The panel must show a fail-closed state when authority is unavailable. It must not calculate a fallback score or synthesize peers.

The local Community display-name preview remains non-authoritative and is not joined to the evidence ledger.

## Privacy and multi-tenancy

All reads require exact:

- tenant id;
- workspace id;
- principal type `student`;
- principal id;
- active principal binding.

A student cannot select another principal through request input. Revoked bindings expose no evidence through the read model.

Public profiles, Leaderboard visibility consent and Instructor-review consent do not grant access to this private ledger. Public aggregation requires a later privacy and k-anonymity policy.

## No score, rank or reward

Evidence v1 must never be used directly as:

- an employability score;
- financial advice;
- a trading-skill certification;
- a scholarship decision;
- a funded-account decision;
- a financial-risk limit;
- an Instructor grant;
- a Mentor recommendation.

A future reputation policy requires a separate versioned specification covering at minimum:

- declared purpose and prohibited uses;
- transparent feature definitions;
- minimum sample size and sparse-data behavior;
- weighting and normalization;
- time decay and policy-version transitions;
- anti-gaming controls;
- bias and disparate-impact review;
- explainability and appeal;
- privacy threshold for public ranking;
- tie handling and pagination stability;
- monitoring, rollback and audit evidence.

## Failure behavior

- Database unavailable: no successful empty authoritative response.
- Binding revoked: no evidence returned.
- Source active or corrupt: materialization rejected.
- Copied identity or counts differ: insertion rejected.
- Digest differs: insertion or read rejected.
- Existing conflicting duplicate: finalization or migration rejected.
- Ledger update/delete attempted: rejected.
- Client payload activates score/rank/reward/Mentor/Instructor: rejected.

## Testing and permanent guard

The authority gate verifies:

- automatic materialization for interactive and worker finalization;
- exact one-row idempotency;
- source-digest parity between PostgreSQL and TypeScript;
- append-only update/delete protection;
- conflict and active-source rejection;
- deterministic basis-point boundaries;
- tenant isolation and revoked-binding hiding;
- strict client aggregate and decision-field validation;
- removal of active browser leaderboard scoring and demo peers;
- route privacy, session, rate-limit and no-store boundaries;
- migration registration and backfill invariants.

The parent #160 remains open. Ranking policy, public Leaderboard, Reward/XP, Mentor consumption and Instructor grants are separate future authorities.
