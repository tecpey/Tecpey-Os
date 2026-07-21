# Community Reputation Evidence Authority

Issue: #230  
Parent: #160  
Operational staging execution: #229

## Status

The implemented policy is **Evidence-only**.

It creates a server-authoritative, immutable record of facts produced by finalized official Community challenges. It is the prerequisite for any future reputation policy, but it is not itself a reputation decision.

The permanent boundaries are explicit:

- **No score** — no numeric reputation or skill score exists.
- **No rank** — no public or private leaderboard position exists.
- **No reward** — no XP, Badge, scholarship, funded account or financial benefit is authorized.
- No Mentor decision — Mentor AI cannot use this ledger as a decision output.
- No Instructor decision — no Instructor access, grant or review authority is created.

Evidence records must never be presented as financial advice, trading certification, employability scoring or proof of future profitability.

## Why evidence comes before ranking

The legacy Community leaderboard calculated scores in the browser from local Academy progress, Arena state and Journal completion, then mixed the user with deterministic demo peers. That could not be authoritative because:

- browser state is mutable and device-specific;
- the formula was not a versioned server policy;
- demo peers were not real participants;
- evidence and policy decisions were mixed together;
- provenance could not be audited or appealed;
- tenant and principal isolation were not enforced by the ranking calculation.

Active browser score generation and demo peers are removed. `community-leaderboard.ts` now contains presentation taxonomy and safety copy only.

## Authoritative source

Evidence v1 accepts only:

```text
official_journal_challenge_finalization
```

The source is a terminal row in PostgreSQL table:

```text
academy_community_challenge_enrollments
```

The source must satisfy all official challenge invariants:

- `challenge_id = journal-reflection-week`;
- `challenge_version = journal-reflection-v1`;
- outcome is `completed` or `not_completed`;
- UTC ISO-week identity and cycle window are valid;
- finalization timestamp and provenance are present;
- `completed` exactly matches at least three eligible closed trades and at least eighty-percent valid Reflection coverage;
- `interactive` finalization has no worker run id;
- `worker` finalization has a valid run id;
- the exact tenant/workspace/student principal binding is active.

No browser payload, request body, display name, local profile, raw PnL, manually entered score or selected user id can create evidence.

## Ledger

The append-only ledger is:

```text
academy_community_reputation_evidence
```

Evidence version:

```text
community-reputation-evidence-v1
```

Each eligible terminal enrollment has exactly one evidence row. The evidence row id and source enrollment id are the same UUID.

Stored fields are limited to:

- tenant, workspace, principal type, principal id and student id;
- evidence version and source type;
- source enrollment id;
- challenge id/version and UTC ISO cycle;
- terminal outcome and finalization timestamp;
- eligible closed-trade count and valid-reflection count;
- deterministic coverage basis points;
- completion-criteria boolean;
- finalization source and optional worker run id;
- canonical SHA-256 source digest;
- database recording timestamp.

The ledger stores no raw trade, order, PnL, Reflection text, display name, contact data, browser identifier, score, rank, reward decision, Mentor output or Instructor output.

## PostgreSQL-owned atomic materialization

PostgreSQL owns materialization through two triggers:

1. an `AFTER INSERT` trigger catches any enrollment inserted directly in terminal state;
2. an `AFTER UPDATE` trigger catches transition from active to `completed` or `not_completed`.

Within the same statement and transaction, the materializer:

1. verifies the active tenant/workspace/principal binding;
2. derives deterministic coverage basis points;
3. derives the completion criterion;
4. derives the canonical SHA-256 digest;
5. inserts the evidence row;
6. reads the resulting row back;
7. compares every authority field with the terminal enrollment;
8. raises an exception for missing or conflicting evidence.

A terminal enrollment therefore cannot be successfully inserted or finalized without matching evidence.

Interactive completion, worker finalization and future terminal code paths all pass through the same database authority. The TypeScript materialization helper exists for exact idempotent verification and controlled repair, not as the primary enforcement mechanism.

## Insert validation and append-only behavior

A `BEFORE INSERT` trigger independently verifies:

- active tenant/workspace/principal binding;
- source is terminal;
- row id equals source enrollment id;
- every identity and cycle field matches the source;
- outcome, counts, coverage and completion criterion match;
- finalization source/run identity matches;
- digest is canonical.

PostgreSQL rejects every `UPDATE` and `DELETE` against the evidence ledger.

Correction is not mutation. A future correction model must be a separately governed, explicitly versioned supersession event. Existing evidence is never silently rewritten.

## Backfill

Migration `0051_community_reputation_evidence.sql` backfills existing official terminal enrollments whose principal binding is active.

The backfill:

- selects only the official challenge id/version;
- accepts only terminal rows;
- uses the same insert validator;
- deterministically derives coverage and digest;
- is exact-idempotent on source enrollment id;
- performs a final fail-closed comparison of identity, version, source type, cycle, outcome, counts, coverage, completion, provenance and digest.

A conflicting historical row prevents migration completion. It is never overwritten to make the migration pass.

## Canonical digest

PostgreSQL and TypeScript compute the same SHA-256 digest over a newline-separated canonical sequence containing:

- evidence version and source type;
- tenant/workspace/principal/student identities;
- source enrollment id;
- challenge and cycle identity;
- terminal outcome and finalization timestamp;
- counts and coverage basis points;
- completion criterion;
- finalization source and worker run id.

UTC timestamps use exact ISO-8601 millisecond precision. TypeScript recomputes the digest whenever a ledger row is read. Corrupt stored evidence does not become a valid summary.

## Deterministic coverage

Coverage is integer basis-point evidence, not a score:

```text
round_half_up(valid_reflections * 10000 / eligible_trades)
```

Examples:

- 0 / 0 = 0;
- 1 / 3 = 3333;
- 2 / 3 = 6667;
- 3 / 4 = 7500;
- 4 / 5 = 8000.

Floating-point ranking arithmetic is not used.

## Private read model

The evidence owner reads:

```text
GET /api/community/reputation-evidence
```

The route:

- accepts no query parameters;
- requires a strict-revocation canonical session;
- requires an Academy student profile;
- resolves tenant/workspace/student identity on the server;
- requires scope `community:reputation:read`;
- joins evidence to an active principal binding;
- applies a bounded rate limit;
- returns `Cache-Control: private, no-store` and `Vary: Cookie`;
- fails closed when storage or authority is unavailable.

The client cannot select tenant, workspace, principal, student or enrollment identity.

## Summary contract

The private summary reports only:

- evidence version and policy status `evidence_only`;
- finalized, completed and not-completed cycle counts;
- total eligible trades and valid Reflections;
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

The strict client parser rejects unknown fields and recomputes counts, coverage, completion and chronology. Any payload attempting to activate score, rank, reward, Mentor or Instructor authority is rejected.

## UI boundary

Community Hub and the existing Leaderboard route display `ReputationEvidencePanel`.

They may show:

- finalized-cycle count;
- completed-cycle count;
- aggregate Reflection coverage;
- latest cycle outcome and counts;
- categories that a future ranking policy might govern, clearly marked locked.

They must not show simulated peers, fallback scores, numeric ranks, reward eligibility or inferred Mentor/Instructor decisions. Authority-unavailable state is fail-closed.

The local Community display-name preview remains non-authoritative and is not joined to the evidence ledger.

## Privacy and multi-tenancy

All reads require exact:

- tenant id;
- workspace id;
- principal type `student`;
- principal id;
- active principal binding.

A principal cannot select another principal through request input. Revoked bindings expose no evidence through the private read model.

Public-profile consent, Leaderboard visibility consent and Instructor-review consent do not grant access to this ledger. Public aggregation requires a later privacy policy with minimum cohort size and anti-reidentification rules.

## Prohibited direct uses

Evidence v1 must not directly determine:

- employability;
- financial advice;
- trading-skill certification;
- scholarship selection;
- funded-account access;
- financial-risk limits;
- Mentor recommendations;
- Instructor grants;
- public ranking.

A future ranking policy requires a separate versioned specification covering at minimum:

- declared purpose and prohibited uses;
- transparent features and weights;
- minimum sample size and sparse-data behavior;
- time decay and policy-version transitions;
- anti-gaming controls;
- bias and disparate-impact review;
- explainability, appeal and correction handling;
- privacy threshold for public ranking;
- stable tie handling and pagination;
- monitoring, rollback and audit evidence.

## Failure behavior

- Database unavailable: no successful empty authoritative response.
- Binding inactive or revoked: no evidence is exposed or materialized.
- Source active or corrupt: materialization is rejected.
- Direct terminal insert without exact evidence: the insert is rolled back.
- Copied identity, cycle, count or provenance differs: insertion is rejected.
- Digest differs: insertion or read is rejected.
- Existing duplicate conflicts: finalization or migration is rejected.
- Ledger update/delete attempted: rejected.
- Client payload activates Score/Rank/Reward/Mentor/Instructor: rejected.

## Testing and permanent guard

The authority gate verifies:

- automatic materialization for terminal insert, interactive update and worker update;
- exact one-row idempotency;
- digest parity between PostgreSQL and TypeScript;
- append-only update/delete protection;
- conflict, inactive-binding and active-source rejection;
- deterministic basis-point boundaries;
- tenant isolation and revoked-binding hiding;
- strict client aggregate and decision-field validation;
- removal of active browser scoring, rank generation and demo peers;
- route session, identity, rate-limit and no-store boundaries;
- migration registration, backfill and full consistency invariants.

The parent #160 remains open. Ranking policy, public Leaderboard, Reward/XP, Mentor consumption and real Instructor grants are separate future authorities. Issue #229 remains open until real staging-host activation evidence exists.
