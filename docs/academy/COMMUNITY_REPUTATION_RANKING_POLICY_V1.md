# Community Reputation Ranking Policy v1

Issue: #232  
Parent: #160  
Implementation successor: #226  
Evidence authority: #230 / `COMMUNITY_REPUTATION_EVIDENCE_AUTHORITY.md`  
Operational staging dependency: #229

## Status

**Proposed policy. Runtime disabled.**

This document defines the narrowest Community ranking policy that can be supported by the current immutable evidence authority without overstating trading skill or creating hidden user scoring.

Until a separate implementation PR satisfies every gate in this document:

- `score` remains `null` in active APIs;
- `rank` remains `null` in active APIs;
- no public leaderboard is authorized;
- no reward, XP, Badge, scholarship, funded account, Mentor decision or Instructor decision is authorized.

Merging this document does not activate ranking.

## Executive decision

Ranking v1 is limited to one educational behavior category:

```text
journal-consistency
```

The current evidence proves Reflection coverage and challenge completion consistency. It does **not** prove Reflection quality, trading skill, profitability, risk competence, employability or future performance.

Accordingly:

- the legacy label `journal-quality` is not an official v1 claim;
- `overall` is unavailable in v1;
- `discipline`, `risk-management`, `learning-consistency` and `scenario-mastery` are unavailable until independent official authorities exist;
- public ranking, when eligible, is a same-tenant opt-in ranking of journal consistency only.

## Purpose

The permitted purpose is to help Academy users understand and improve a repeatable Reflection habit after official Arena trades.

The policy may support:

- private self-understanding;
- transparent progress explanations;
- voluntary same-tenant community participation;
- educational encouragement without financial claims.

The policy must never be represented as:

- financial advice;
- a trading signal;
- proof of profitability;
- a risk-limit recommendation;
- a trading-skill certification;
- an employability score;
- a scholarship or funded-account decision;
- a Mentor or Instructor decision.

## Authoritative evidence

Ranking v1 may consume only immutable rows from:

```text
academy_community_reputation_evidence
```

with:

```text
evidence_version = community-reputation-evidence-v1
source_type = official_journal_challenge_finalization
challenge_id = journal-reflection-week
challenge_version = journal-reflection-v1
```

Every consumed row must:

- belong to the exact active tenant/workspace/student principal binding;
- pass canonical digest verification;
- represent a terminal `completed` or `not_completed` challenge cycle;
- preserve the source UTC ISO-week identity;
- remain append-only and unsuperseded by any future governed correction event.

No browser state, request body, display name, local profile, raw Reflection text, raw PnL, balance, order size, trade ID, manually entered score or client timestamp may affect eligibility, score or ordering.

## Policy identity

```text
policy_id = community-reputation-ranking
policy_version = community-reputation-ranking-v1
category = journal-consistency
score_scale = integer basis points, 0..10000
```

A ranking snapshot must contain exactly one policy version. Rows from different policy versions must never be mixed in one cohort, page or rank calculation.

## Evidence window

For a snapshot at PostgreSQL time `T`:

1. consider official finalized cycles whose `cycle_end` is within the trailing 12 complete UTC ISO weeks before or at `T`;
2. order cycles by `cycle_end DESC`, then immutable source evidence id;
3. retain at most the newest 8 finalized cycles for the principal;
4. use each retained cycle exactly once.

The window is based on PostgreSQL time and canonical cycle boundaries, never browser time.

## Eligibility

A principal is `rankable` only when all conditions are true:

- the active Community consent revision has `leaderboard_visible = true`;
- the principal binding is active at snapshot creation;
- at least 4 finalized cycles exist in the policy window;
- retained cycles contain at least 12 total eligible closed trades;
- every retained evidence row passes digest and invariant verification;
- no unresolved governed correction or integrity conflict affects a retained row.

Otherwise the principal is `unranked` with exactly one primary reason code:

```text
not_opted_in
insufficient_finalized_cycles
insufficient_eligible_trades
inactive_principal_binding
evidence_integrity_unavailable
evidence_correction_pending
policy_unavailable
```

There is no fallback score, default score, synthetic peer or inferred rank.

## Cycle-level values

For each retained finalized cycle `i`:

```text
coverage_i_bps = canonical evidence coverage basis points, 0..10000
completion_i = 1 when outcome = completed, otherwise 0
```

Each cycle has equal policy weight. Trade volume does not increase the weight of a cycle.

This prevents high-frequency activity from dominating lower-volume users who satisfy the same minimum evidence contract.

## Score formula

Let `N` be the number of retained cycles.

```text
mean_coverage_bps = round_half_up(sum(coverage_i_bps) / N)
completion_rate_bps = round_half_up(sum(completion_i) * 10000 / N)

journal_consistency_score_bps = round_half_up(
  (mean_coverage_bps * 8000 + completion_rate_bps * 2000) / 10000
)
```

All operations use integer or exact Decimal arithmetic. JavaScript floating-point arithmetic is forbidden in authoritative computation.

The final score is clamped only as an invariant assertion to `0..10000`; an out-of-range intermediate is an authority error, not a value to silently repair.

## Formula rationale

- `mean_coverage_bps` measures how consistently eligible closed trades receive valid canonical Reflections.
- `completion_rate_bps` measures whether the user repeatedly satisfies the official minimum cycle contract.
- equal cycle weighting avoids rewarding raw trade volume;
- the formula uses no profit, return, balance, order size, trading frequency bonus or semantic analysis of free-form text;
- the 80/20 weighting keeps the score primarily tied to Reflection coverage while retaining a bounded consistency signal.

This formula does not claim to measure the quality or correctness of the Reflection content.

## Worked examples

### Example A — eligible and consistent

Four cycles:

```text
coverage = [10000, 9000, 8000, 10000]
outcome = [completed, completed, completed, completed]
```

```text
mean_coverage_bps = 9250
completion_rate_bps = 10000
score = round_half_up((9250 * 8000 + 10000 * 2000) / 10000)
score = 9400
```

### Example B — eligible with mixed completion

Four cycles:

```text
coverage = [8000, 8000, 6000, 9000]
outcome = [completed, completed, not_completed, completed]
```

```text
mean_coverage_bps = 7750
completion_rate_bps = 7500
score = 7700
```

### Example C — insufficient evidence

Three finalized cycles and 18 eligible trades:

```text
state = unranked
reason = insufficient_finalized_cycles
score = null
rank = null
```

### Example D — opted out

Eight finalized cycles and otherwise valid evidence, but `leaderboard_visible = false`:

```text
state = unranked
reason = not_opted_in
score = null
rank = null
```

The private evidence panel may continue to show evidence facts permitted by Evidence v1, but no ranking projection is created.

## Private bands

A private self view may describe the exact score using non-judgmental educational bands:

```text
9000..10000 = highly_consistent
8000..8999  = consistent
7000..7999  = developing_consistency
0..6999     = building_consistency
```

Bands must not use language such as expert, profitable, safe trader, low risk, employable or certified.

## Same-tenant cohort

Public ranking is permitted only inside one exact tenant and workspace.

A public cohort contains only principals who:

- are `rankable` under the same policy version and snapshot;
- have active principal bindings;
- have active revisioned `leaderboard_visible = true` consent at snapshot creation.

Cross-tenant or cross-workspace discovery is forbidden.

## Minimum cohort and suppression

A public leaderboard requires at least 25 rankable opted-in principals in the exact tenant/workspace snapshot.

When the cohort contains fewer than 25 principals:

```text
public_state = suppressed_small_cohort
public_entries = []
```

The API must not return the exact suppressed cohort size. It may return only:

```text
cohort_size_bucket = below_public_threshold
```

For visible cohorts, permitted buckets are:

```text
25-49
50-99
100-249
250+
```

The exact cohort size is private operational telemetry and is not part of the public contract.

## Pseudonymous identity

Public entries must use a policy-versioned pseudonym derived server-side from a dedicated tenant-scoped secret version and immutable principal identity.

Conceptual derivation:

```text
HMAC-SHA256(secret_version, tenant_id || workspace_id || principal_id || policy_version)
```

The public representation may expose a bounded token such as:

```text
TP-7F31A9C2
```

Requirements:

- raw tenant, workspace, principal and student identifiers are never exposed;
- display name, email, phone, username and avatar are not required for ranking;
- pseudonyms are stable within one policy version;
- secret rotation requires an explicit version transition and must not silently merge old and new snapshots;
- the HMAC input and full digest are never returned to clients.

## Rank and ties

Public rank uses dense ranking on `journal_consistency_score_bps DESC`.

Principals with the same exact score receive the same rank.

Display order inside an equal-score tie uses a non-public deterministic HMAC sort key derived from the snapshot identity and principal identity. The tie sort key has no product meaning and cannot change the shared rank.

Browser time, random IDs, mutable display names, enrollment time, wealth, trade count beyond eligibility and exact finalization time are forbidden tie-breakers.

## Snapshot and pagination

Authoritative ranking is generated as an immutable PostgreSQL snapshot.

A snapshot records at minimum:

- snapshot id;
- policy id and version;
- tenant/workspace identity;
- PostgreSQL creation time;
- evidence boundary;
- consent revision boundary;
- cohort state and permitted cohort-size bucket;
- canonical digest of ordered projection rows.

Public reads use only the latest completed valid snapshot. Partially generated or conflicting snapshots are unavailable.

Pagination requirements:

- opaque signed cursor;
- cursor bound to exact snapshot id, policy version and page size;
- stable ordering for the complete life of the snapshot;
- changed or expired snapshot cursor fails closed and instructs the client to restart;
- maximum page size is bounded by the API authority;
- no offset pagination for authoritative public ranking.

## Private response allowlist

The authenticated principal may receive only:

```text
policyVersion
category
state
reason
windowStartDate
windowEndDate
finalizedCycles
completedCycles
eligibleTrades
meanCoverageBps
completionRateBps
scoreBps
band
snapshotDate
publicOptIn
publicCohortState
rank
```

Rules:

- `scoreBps`, `band` and `rank` are non-null only when policy and eligibility permit them;
- `rank` is null when the public cohort is suppressed, even if the private score is available;
- dates are bounded policy dates, not raw evidence timestamps;
- no other principal’s private breakdown is exposed.

## Public response allowlist

A visible public leaderboard may expose only:

```text
policyVersion
category
snapshotDate
cohortSizeBucket
nextCursor
entries[]
```

Each entry may contain only:

```text
pseudonym
rank
band
```

Public responses must not expose:

- exact score;
- exact cohort size;
- tenant/workspace/principal/student/evidence identifiers;
- display name, contact information or avatar;
- exact timestamps;
- trades, orders, balances, PnL or returns;
- eligible-trade counts or Reflection counts;
- raw Reflection text;
- anti-gaming flags, appeal state or correction state;
- Mentor, Instructor, reward or scholarship data.

## Anti-gaming controls

Ranking v1 must remain bounded to facts already validated by the official challenge authority.

Mandatory controls:

- one official evidence row per finalized challenge cycle;
- equal cycle weighting;
- no volume bonus;
- no client-selected cycle or evidence exclusion;
- no direct free-form text scoring;
- no score changes from repeated reads or refresh requests;
- exact idempotent snapshot refresh;
- divergent replay conflicts;
- anomaly telemetry for impossible coverage, duplicate source identity, rapid consent churn and repeated integrity failures.

A future semantic Reflection-quality model requires a separate AI/data-governance policy, evaluation set, language fairness review, privacy review and appeal process. It is not part of v1.

Anti-gaming evidence must not silently create financial restrictions, account suspension, scholarship denial, Mentor judgment or Instructor denial.

## Fairness and harm boundaries

Ranking v1 intentionally excludes features likely to create unfair advantage or harmful incentives:

- profit and return;
- account balance or purchasing power;
- number or size of trades beyond minimum eligibility;
- device type, network quality or browser activity;
- language style, writing length or vocabulary sophistication;
- time-of-day or time-zone activity;
- social popularity, followers, reactions or referrals;
- paid subscription tier.

The rollout review must compare eligibility, score distribution, opt-out rate, suppressed-cohort rate and appeal rate across product-relevant cohorts without collecting unnecessary sensitive personal attributes.

A material unexplained disparity blocks public rollout.

## Explainability

The private self view must explain:

- the exact policy version;
- the evidence window;
- why the user is ranked or unranked;
- finalized and completed cycle counts;
- total eligible-trade count used only for eligibility;
- mean Reflection coverage;
- completion rate;
- the exact 80/20 formula;
- why profit, balance and trade volume do not affect the result;
- why unavailable categories are not treated as zero.

No explanation may disclose another principal’s evidence or anti-gaming state.

## Appeal and correction

A user may challenge:

- missing official cycle evidence;
- incorrect active-consent state;
- incorrect principal binding;
- a verified source integrity error;
- application of the wrong policy version or evidence window.

Appeals do not mutate immutable evidence rows or historical snapshots.

A valid correction requires a separately governed append-only supersession/correction event. A new snapshot may consume the correction only when its policy explicitly supports that correction version.

Pending correction state produces:

```text
state = unranked
reason = evidence_correction_pending
```

The public API exposes no appeal details.

## Consent behavior

- default is private;
- opt-in and opt-out use the revisioned server-authoritative Community consent authority;
- browser storage is not consent authority;
- opt-out removes the principal from the next valid public snapshot;
- current public cache invalidation must be bounded and documented;
- historical immutable snapshots remain audit evidence but are not publicly queryable by identity;
- consent changes do not delete immutable evidence.

## Rollout stages

### Stage 0 — current state

- Evidence v1 active;
- ranking runtime disabled;
- all score/rank outputs remain null;
- no public leaderboard.

### Stage 1 — shadow computation

Minimum duration: 4 complete UTC ISO weeks.

Requirements:

- compute snapshots without exposing scores or ranks to users;
- verify deterministic replay and exact digest stability;
- verify no cross-tenant or cross-principal leakage;
- measure eligibility, suppression and integrity-failure rates;
- run anti-gaming and fairness review;
- preserve existing UI as evidence-only.

### Stage 2 — private self preview

Minimum duration: 14 days after accepted Stage 1 evidence.

Requirements:

- expose only the user’s own breakdown;
- keep public ranking disabled;
- collect explanation comprehension, opt-out and appeal signals;
- no downstream decision use.

### Stage 3 — public same-tenant pilot

Requirements:

- all Stage 1 and Stage 2 acceptance evidence approved;
- at least one tenant/workspace has 25 rankable opted-in principals;
- privacy and re-identification review accepted;
- stable cursor and snapshot tests pass;
- rollback has been exercised in staging;
- public output contains only the allowlisted fields.

Public rollout remains tenant-scoped and reversible.

## Monitoring and rollback

Monitor at minimum:

- snapshot generation success/failure;
- exact replay and divergent replay conflicts;
- evidence-integrity failures;
- cohort suppression rate;
- ranked/unranked reason distribution;
- consent churn;
- appeal and correction rate;
- score distribution and boundary concentration;
- pagination/cursor rejection rate;
- cross-tenant negative-test results;
- public cache invalidation correctness.

Rollback must:

- disable score and rank display;
- return the UI to Evidence v1 only;
- stop public snapshot reads;
- preserve immutable evidence, policy versions and historical snapshots;
- create no replacement fallback score or demo peers.

## Explicitly unsupported outcomes

Ranking v1 cannot directly or indirectly authorize:

- XP or Badge issuance;
- financial or token rewards;
- scholarships;
- funded trading accounts;
- employment or Instructor eligibility;
- Mentor recommendations or behavioral labels;
- exchange limits, custody permissions or risk restrictions;
- KYC/AML decisions;
- public cross-tenant discovery;
- trading signals or copy trading;
- claims of skill, safety or profitability.

Each future downstream use requires a separate versioned policy, issue, implementation authority and adversarial test gate.

## Implementation gates for #226

Runtime work under #226 may begin only after this document is approved and the implementation plan proves:

1. a PostgreSQL-owned immutable snapshot schema;
2. exact policy-version and evidence-boundary identity;
3. integer/Decimal-safe formula parity in SQL and TypeScript;
4. active-consent snapshot binding;
5. same-tenant cohort isolation;
6. minimum cohort suppression;
7. pseudonym HMAC secret/version governance;
8. dense rank and stable tie ordering;
9. opaque signed cursor pagination;
10. strict private/public parsers with unknown-field rejection;
11. shadow mode and rollback controls;
12. permanent guards against PnL, browser state, demo peers and downstream decisions;
13. PostgreSQL, tenant-isolation, concurrency, replay, privacy, parser, build and runtime evidence on one unchanged head.

## Approval record

Before changing status from `Proposed policy` to `Approved for shadow implementation`, record:

- policy owner;
- product owner;
- privacy/security reviewer;
- Academy/Arena evidence owner;
- approval date;
- exact document blob SHA;
- unresolved exceptions, if any;
- successor implementation issue and PR.

No approval may be inferred from code merge, issue assignment or the existence of this document.
