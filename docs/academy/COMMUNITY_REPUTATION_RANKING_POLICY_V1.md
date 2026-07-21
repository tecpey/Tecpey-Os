# Community Reputation Ranking Policy v1

Issue: #232  
Parent: #160  
Implementation successor: #226  
Evidence authority: #230 / `COMMUNITY_REPUTATION_EVIDENCE_AUTHORITY.md`  
Operational staging dependency: #229  
Policy id: `community-reputation-ranking`  
Policy version: `community-reputation-ranking-v1`

## Status

**Approved governance policy. Runtime disabled.**

This document authorizes only the policy contract. It does not activate a score, rank, public leaderboard, reward, scholarship, funded account, Mentor decision or Instructor decision.

Until a separate implementation PR satisfies every gate in this document:

- active API `score` values remain `null`;
- active API `rank` values remain `null`;
- no production principal is scored without explicit scoring consent;
- no public ranking snapshot is generated or exposed;
- no downstream outcome may consume reputation evidence or a future score.

## Executive decision

Ranking v1 supports exactly one educational behavior category:

```text
journal-consistency
```

The current immutable evidence can prove bounded Reflection coverage and repeated completion of the official journal-reflection challenge. It cannot prove:

- Reflection quality;
- trading skill;
- profitability or future performance;
- risk competence;
- employability;
- suitability for financial rewards, scholarships or funded accounts.

The following categories are unavailable in v1:

```text
journal-quality
overall
discipline
risk-management
learning-consistency
scenario-mastery
```

Unavailable categories are not treated as zero and are never silently included in a composite.

## Permitted purpose

The permitted purpose is to help a learner understand and improve a repeatable Reflection habit after official Arena trades.

The policy may support:

- private self-understanding;
- transparent educational explanations;
- voluntary same-tenant community participation;
- non-financial encouragement.

It must never be represented as financial advice, a trading signal, a certificate of skill, a safety rating, an employability score or a downstream eligibility decision.

## Separate consent authorities

Ranking v1 requires two independent, revisioned, PostgreSQL-authoritative decisions:

```text
reputation_scoring_enabled
leaderboard_visible
```

Rules:

- both default to `false`;
- scoring consent permits only private self scoring under the approved policy;
- public visibility permits public cohort inclusion only while scoring consent is also active;
- enabling public visibility never enables scoring consent;
- disabling scoring consent immediately prevents future score materialization and makes public visibility ineffective;
- disabling scoring consent must not silently rewrite the stored public preference;
- disabling public visibility removes the principal from future public snapshots while private scoring may continue;
- consent comes only from the revisioned server authority;
- browser state, UI defaults, challenge participation and historical profile visibility are never consent;
- consent changes do not delete immutable source evidence.

`leaderboard_visible` must never be reinterpreted as permission for private profiling.

## Authoritative evidence

Ranking v1 may consume only verified immutable rows from:

```text
academy_community_reputation_evidence
```

with all of the following identities:

```text
evidence_version = community-reputation-evidence-v1
source_type = official_journal_challenge_finalization
challenge_id = journal-reflection-week
challenge_version = journal-reflection-v1
```

Every consumed row must:

- belong to the exact active tenant, workspace and principal binding;
- pass canonical digest and invariant verification;
- represent one terminal `completed` or `not_completed` cycle;
- preserve the canonical UTC ISO-week identity;
- be append-only and not affected by an unresolved correction or integrity conflict.

The following inputs are forbidden:

- browser or request-supplied evidence;
- display names or mutable profile fields;
- raw Reflection text;
- PnL, returns, balances, order size or trade volume bonuses;
- trade or order identifiers in a response;
- client timestamps, manually entered scores or random values.

## Evidence window

For a snapshot created at PostgreSQL time `T`:

1. consider finalized cycles ending within the trailing 12 complete UTC ISO weeks;
2. order by canonical `cycle_end DESC`, then immutable source evidence id;
3. retain at most the newest 8 cycles;
4. consume each retained cycle exactly once.

Browser time cannot define or alter the window.

## Private scoring eligibility

A principal is `privately_scorable` only when every condition is true:

- `reputation_scoring_enabled = true` on the active consent revision;
- the canonical principal binding is active;
- at least 4 finalized cycles exist in the policy window;
- retained cycles contain at least 12 total eligible closed trades;
- at least 2 retained cycles have terminal outcome `completed`;
- every retained evidence row passes digest and invariant verification;
- no retained row has a pending governed correction or integrity conflict.

The completed-cycle minimum prevents high Reflection coverage on repeatedly ineligible or under-threshold weeks from being presented as established challenge consistency.

An ineligible principal is `unscored` with one primary reason:

```text
scoring_not_enabled
insufficient_finalized_cycles
insufficient_eligible_trades
insufficient_completed_cycles
inactive_principal_binding
evidence_integrity_unavailable
evidence_correction_pending
policy_unavailable
```

There is no fallback, default, synthetic or inferred score.

## Public ranking eligibility

A principal is `publicly_rankable` only when:

- every private scoring condition is true; and
- `leaderboard_visible = true` on the active public-visibility consent revision.

When private scoring is available but public visibility is disabled:

```text
private_state = scored
public_state = not_publicly_opted_in
rank = null
```

The learner may still see their own private explanation.

## Cycle values

For each retained cycle `i`:

```text
coverage_i_bps = verified coverage basis points, 0..10000
completion_i = 1 when outcome = completed, otherwise 0
```

Every cycle has equal weight. Additional trade volume does not increase cycle weight.

## Score formula

Let `N` be the number of retained cycles:

```text
mean_coverage_bps = round_half_up(sum(coverage_i_bps) / N)
completion_rate_bps = round_half_up(sum(completion_i) * 10000 / N)

journal_consistency_score_bps = round_half_up(
  (mean_coverage_bps * 8000 + completion_rate_bps * 2000) / 10000
)
```

Requirements:

- authoritative computation uses integer or exact Decimal arithmetic;
- JavaScript floating-point arithmetic is forbidden;
- the formula runs only after eligibility succeeds;
- an out-of-range intermediate is an authority error;
- clamping is permitted only as a final invariant assertion, never as silent repair.

The score measures bounded Reflection coverage and completed-cycle consistency. It does not measure the correctness or semantic quality of Reflection content.

## Worked examples

### Eligible and publicly visible

```text
coverage = [10000, 9000, 8000, 10000]
outcome = [completed, completed, completed, completed]
reputation_scoring_enabled = true
leaderboard_visible = true

mean_coverage_bps = 9250
completion_rate_bps = 10000
score_bps = 9400
```

Public rank still requires the minimum cohort and a valid immutable snapshot.

### Eligible with mixed completion

```text
coverage = [8000, 8000, 6000, 9000]
outcome = [completed, completed, not_completed, completed]

mean_coverage_bps = 7750
completion_rate_bps = 7500
score_bps = 7700
```

### Too few finalized cycles

```text
finalized_cycles = 3
eligible_trades = 18
private_state = unscored
reason = insufficient_finalized_cycles
score = null
rank = null
```

### No completed cycles

```text
finalized_cycles = 6
eligible_trades = 12
completed_cycles = 0
private_state = unscored
reason = insufficient_completed_cycles
score = null
rank = null
```

High coverage alone cannot bypass the completed-cycle eligibility gate.

### Private score with public opt-out

```text
reputation_scoring_enabled = true
leaderboard_visible = false
private_state = scored
public_state = not_publicly_opted_in
rank = null
```

### Public visibility without scoring consent

```text
reputation_scoring_enabled = false
leaderboard_visible = true
private_state = unscored
reason = scoring_not_enabled
public_state = ineligible_without_scoring_consent
score = null
rank = null
```

## Private educational bands

A private self view may use only these non-judgmental labels:

```text
9000..10000 = highly_consistent
8000..8999  = consistent
7000..7999  = developing_consistency
0..6999     = building_consistency
```

Bands may not use terms such as expert, profitable, safe trader, low risk, employable or certified.

## Same-tenant public cohort

A public cohort is restricted to one exact tenant and workspace and contains only principals who:

- are `publicly_rankable` under the same policy version and snapshot;
- have active canonical principal bindings;
- have active scoring consent;
- have active public-visibility consent.

Cross-tenant and cross-workspace discovery are forbidden.

## Minimum cohort and suppression

A public leaderboard requires at least 25 publicly rankable principals in the exact tenant/workspace snapshot.

Below that threshold:

```text
public_state = suppressed_small_cohort
public_entries = []
cohort_size_bucket = below_public_threshold
```

The exact suppressed cohort size is never returned.

Visible cohort buckets are limited to:

```text
25-49
50-99
100-249
250+
```

## Pseudonymous identity

Public entries use a policy-versioned pseudonym generated server-side.

The HMAC key is the actual high-entropy tenant-scoped secret material. A secret version is metadata and may be included in the message for domain separation, but it is never used as the cryptographic key by itself.

Conceptual derivation:

```text
HMAC-SHA256(
  tenant_scoped_secret_material,
  secret_version || tenant_id || workspace_id || principal_id || policy_version
)
```

The public token may be a bounded representation such as:

```text
TP-7F31A9C2
```

Requirements:

- raw tenant, workspace, principal and student identifiers are never exposed;
- display name, email, phone, username and avatar are not required;
- pseudonyms remain stable only within the governed secret and policy version;
- secret material is stored and rotated through an approved secret-management authority;
- rotation creates an explicit version transition and never mixes incompatible snapshots;
- HMAC input, key material and full digest are never returned to clients or logs.

## Rank and deterministic ties

Public rank uses dense ranking on:

```text
journal_consistency_score_bps DESC
```

Equal scores receive the same rank.

Display ordering within a tie uses a separate non-public HMAC sort key keyed by approved secret material and bound to snapshot identity, principal identity and a distinct domain label. The tie key has no product meaning and cannot alter shared rank.

Forbidden tie-breakers include browser time, randomness, mutable display name, wealth, enrollment time, raw volume and exact evidence timestamps.

## Immutable snapshots

An authoritative ranking snapshot records at minimum:

- snapshot id;
- policy id and version;
- exact tenant/workspace identity;
- PostgreSQL creation time;
- evidence boundary;
- scoring-consent revision boundary;
- public-visibility consent revision boundary;
- pseudonym secret version, never secret material;
- cohort state and permitted cohort bucket;
- canonical digest of ordered projection rows.

Only the latest completed, verified snapshot may serve public reads. Partial, conflicting or integrity-invalid snapshots are unavailable.

## Pagination

Public pagination requires:

- an opaque authenticated cursor;
- binding to exact snapshot id, policy version and page size;
- stable ordering for the snapshot lifetime;
- bounded maximum page size;
- fail-closed rejection of changed, expired or invalid cursors;
- no authoritative offset pagination.

## Private response allowlist

The authenticated principal may receive only:

```text
policyVersion
category
privateState
privateReason
publicState
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
scoringConsentEnabled
publicVisibilityEnabled
publicCohortState
rank
```

Rules:

- `scoreBps` and `band` are non-null only after private eligibility succeeds;
- `rank` is non-null only after public eligibility, cohort and snapshot gates succeed;
- rank remains null for a suppressed cohort;
- dates are bounded policy dates, not raw event timestamps;
- another principal’s private breakdown is never exposed.

## Public response allowlist

A visible public response may contain only:

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

Public responses must not expose exact score, exact cohort size, internal identifiers, contact data, avatar, trades, orders, balances, PnL, returns, Reflection counts, raw text, consent revisions, anti-gaming state, appeal state or downstream decision data.

## Anti-gaming controls

Mandatory controls include:

- one official evidence row per finalized challenge cycle;
- equal cycle weighting;
- no volume bonus;
- no client-selected inclusion or exclusion;
- no free-form semantic scoring;
- read operations cannot change score;
- exact snapshot replay is idempotent;
- divergent replay conflicts;
- impossible coverage, duplicate source identity, consent churn and integrity failures produce bounded operational telemetry.

A future semantic quality model requires a separate AI/data policy, evaluation set, multilingual fairness review, privacy review and appeal process.

## Fairness and exclusion controls

Ranking v1 excludes:

- PnL, returns, balances and capital;
- trading frequency beyond minimum eligibility;
- subscription tier or payment history;
- social popularity, followers, reactions and referrals;
- device, geography or network quality;
- Mentor sentiment or hidden AI inference;
- private demographic or protected-class data.

Before public rollout, an approved review must examine consent, eligibility, suppression, score distribution, opt-out and appeal patterns. A material unexplained disparity blocks rollout.

## Explanation and appeal

The private self view must explain:

- policy version and category;
- both consent states;
- evidence window;
- scored/unscored reason;
- public ranked/opted-out/suppressed reason;
- finalized, completed and eligible-trade counts;
- mean coverage and completion rate;
- exact integer formula;
- exclusion of profit, balance and volume;
- unavailable categories.

A user may challenge missing evidence, consent state, principal binding, source integrity, correction state or policy/window selection.

Corrections are append-only and governed. Source evidence and historical snapshots are never silently mutated.

Pending correction produces:

```text
private_state = unscored
reason = evidence_correction_pending
```

## Consent lifecycle

- both consent authorities are default-off and revisioned;
- private scoring begins only after committed scoring consent;
- public inclusion begins only after committed public consent and active scoring consent;
- revocation affects the next valid snapshot and bounded caches;
- scoring revocation stops future score materialization;
- immutable evidence and consent history remain retained under their governing policies;
- no worker may infer consent from participation, profile visibility or prior scoring.

## Rollout stages

### Stage 0 — policy only

- evidence authority may exist;
- runtime scoring and ranking remain disabled;
- all score and rank outputs remain null.

### Stage 1 — consent-safe shadow validation

Minimum duration: 4 complete UTC ISO weeks.

- use synthetic fixtures and explicitly consented test principals only;
- prove SQL/TypeScript formula parity and exact replay;
- prove tenant isolation, cohort suppression, pseudonym key governance and rollback;
- expose no score or rank to production users.

### Stage 2 — private self pilot

Minimum duration: 14 days after accepted Stage 1 evidence.

- require explicit scoring consent;
- expose only the principal’s own explanation;
- keep public ranking disabled;
- collect bounded comprehension, opt-out and appeal evidence;
- permit no downstream decision use.

### Stage 3 — same-tenant public pilot

- all prior evidence is approved;
- at least one tenant/workspace has 25 publicly rankable principals;
- scoring and public consent flows are independently tested;
- privacy and re-identification review is accepted;
- cursor, snapshot, secret rotation and rollback have been exercised in staging;
- public output matches the strict allowlist.

No wider rollout occurs without a separate approval record.

## Monitoring

Monitor only minimum-necessary operational signals:

- snapshot success/failure;
- replay conflicts;
- integrity and correction states;
- scoring/public consent transitions;
- scored/unscored reason distribution;
- public eligibility and suppression buckets;
- appeal/correction rate;
- score boundary concentration;
- cursor rejection rate;
- rollback readiness.

Telemetry must not contain secret material, raw evidence text or public re-identification data.

## Rollback

Rollback must:

- disable private score and public rank display;
- stop new snapshot materialization;
- stop public snapshot reads;
- restore Evidence v1-only UI behavior;
- preserve immutable evidence, consent history, policy versions and historical snapshots;
- create no demo peers, fallback score or replacement ranking.

## Explicitly unsupported outcomes

Ranking v1 cannot issue or influence:

- XP, badges or financial rewards;
- scholarships or funded accounts;
- Mentor or Instructor decisions;
- employability or certification;
- Exchange limits, fees or access;
- custody, withdrawal, KYC, AML, compliance or risk decisions;
- lending, credit, insurance or pricing.

Each future use requires an independent policy, issue, implementation, privacy review, adversarial evidence and rollback plan.

## Implementation gate for #226

Runtime work may begin only as a separate shadow-only PR that proves:

1. immutable PostgreSQL snapshot schema;
2. exact policy/evidence/consent boundaries;
3. integer or Decimal-safe formula parity;
4. the minimum of 2 completed cycles;
5. independent scoring and public consent;
6. same-tenant cohort isolation;
7. minimum cohort suppression;
8. pseudonym and tie HMACs keyed by actual secret material;
9. governed secret versioning and rotation;
10. dense rank and stable tie ordering;
11. authenticated opaque cursors;
12. strict private/public parsers with unknown-field rejection;
13. deterministic replay and divergent conflict;
14. correction and integrity fail-closed states;
15. no browser/demo authority;
16. no downstream decision output;
17. staging rollback evidence;
18. Security, Privacy and Product approval.

## Change governance

Any change to category, evidence source, eligibility minimum, formula, weight, band, consent behavior, cohort threshold, pseudonym derivation, response field, rollout stage or downstream use requires:

- a new policy version;
- explicit migration and compatibility rules;
- new test fixtures and adversarial evidence;
- Security and Privacy review;
- Product approval;
- independent rollback evidence.

The approved v1 policy remains immutable once a runtime snapshot references it.
