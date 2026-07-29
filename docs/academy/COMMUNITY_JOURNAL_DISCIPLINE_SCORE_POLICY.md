# Community Journal Discipline Score Policy v1

Issue: #233  
Parent: #160  
Evidence predecessor: #230 / PR #231  
Consent authority: #235

## Purpose

`journal-discipline-score-v1` is a private, explainable projection of one narrow behavior: whether a learner consistently completes the official journal-reflection challenge and records valid Reflections for eligible Trading Arena closes.

It is not a global reputation score. It does not measure trading skill, profitability, financial safety, investment knowledge, employability or suitability for funded capital.

## Explicit scoring consent

The score is **default off** and must not be computed until the authenticated learner explicitly enables the separate server-authoritative consent:

```text
community-reputation-scoring-consent-v1
```

The scoring decision is independent from Community profile visibility and `leaderboard_visible`.

Permanent rules:

- public profile visibility never authorizes private scoring;
- leaderboard visibility never authorizes private scoring;
- participation in the journal challenge never authorizes private scoring;
- historical profile consent is never reinterpreted as scoring consent;
- all existing and new learners begin with scoring disabled;
- when consent is disabled, the server does not select or evaluate the learner's evidence window;
- the API returns `journal_discipline_score_consent_required` rather than a score, estimate or empty authoritative result;
- consent revocation blocks future computation immediately without deleting immutable source evidence;
- a revoked principal binding remains an authority failure, not a consent-required state.

Consent state is resolved inside the same read-only PostgreSQL transaction used for the score authority. The client cannot submit consent state to the score endpoint.

## Source of truth

After active principal binding and explicit scoring consent are proven, the policy consumes only immutable rows from:

`academy_community_reputation_evidence`

Each source row must already satisfy the `community-reputation-evidence-v1` authority:

- source type `official_journal_challenge_finalization`;
- terminal official challenge enrollment;
- exact tenant/workspace/student principal ownership;
- active principal binding;
- canonical challenge identity and UTC ISO-week cycle;
- exact counts, coverage and terminal outcome;
- canonical SHA-256 source digest;
- append-only storage.

Browser storage, public profile data, raw PnL, trade size, trade frequency, Reflection text and request-provided identity are not policy inputs.

## Evaluation window

The server selects at most the latest 12 finalized official cycles, ordered by:

1. `cycle_ends_at DESC`;
2. `source_enrollment_id DESC` as deterministic tie-breaker.

Duplicate cycle keys or duplicate source enrollment identities fail closed.

Every selected cycle has equal influence. A cycle with 100 trades has the same policy weight as a cycle with 3 trades. This prevents trade volume or overtrading from increasing the score.

## Minimum evidence

A score is available only after at least 4 finalized cycles.

Below four cycles, after scoring consent is active:

- status is `insufficient_evidence`;
- `scoreBasisPoints` is `null`;
- the UI shows only evidence-building progress;
- no estimated or fallback score is produced.

Insufficient evidence and absent consent are different states. Absent consent prevents computation entirely.

## Integer formula

All policy arithmetic uses integer basis points from 0 to 10,000. Floating-point values are not decision authority.

### Completion consistency — 60%

```text
completionConsistencyBps = roundHalfUp(
  completedCycles × 10000 ÷ evaluatedCycles
)
```

For zero evaluated cycles, the component is zero.

### Equal-weight mean Reflection coverage — 40%

```text
meanCoverageBps = roundHalfUp(
  sum(each selected cycle coverageBasisPoints) ÷ evaluatedCycles
)
```

For zero evaluated cycles, the component is zero.

The policy intentionally averages cycle coverage values rather than summing trade counts across cycles.

### Final private score

```text
scoreBps = roundHalfUp(
  (completionConsistencyBps × 6000
   + meanCoverageBps × 4000)
  ÷ 10000
)
```

`roundHalfUp(numerator, denominator)` is:

```text
floor((numerator + floor(denominator / 2)) / denominator)
```

## Reproducibility digest

The server computes `evaluatedEvidenceDigest` as SHA-256 over a canonical ordered input containing:

- policy version and scope;
- lookback and minimum-evidence constants;
- each selected cycle key and window;
- terminal outcome;
- validated per-cycle coverage basis points;
- immutable source evidence digest.

Raw source digests and source enrollment IDs are not returned to the browser. The client validates the returned digest format and independently recomputes all response arithmetic available within the privacy-safe projection.

## Private API

GET-only endpoint:

`/api/community/journal-discipline-score`

Controls:

- strict-revocation canonical session;
- Academy student profile required;
- no query parameters;
- server-resolved tenant/workspace/student principal context;
- scope `community:reputation:read`;
- explicit active-binding verification;
- explicit default-off scoring-consent verification;
- read-only PostgreSQL transaction;
- five-second statement timeout and one-second lock timeout;
- bounded rate limiting;
- `Cache-Control: private, no-store`;
- `Vary: Cookie`;
- explicit `409 journal_discipline_score_consent_required` when consent is absent;
- fail-closed `503` on authority, binding or storage failure.

The endpoint accepts no identity, consent, policy version, cycle selection, score, count, timestamp or digest from the client.

## Response boundary

Only after consent is active, the private projection may expose:

- policy version and `journal_discipline_only` scope;
- status;
- lookback, minimum, remaining and evaluated cycle counts;
- completed and not-completed cycle counts;
- completion consistency basis points;
- equal-weight mean coverage basis points;
- score basis points only when evidence is sufficient;
- selected window start and end;
- evaluated evidence digest.

It does not expose source enrollment IDs, student/principal IDs, raw source digests, trade counts, PnL, Reflection text, public identity or another learner's data.

## Fixed non-decisions

This policy always returns:

- `rank: null`;
- `percentile: null`;
- `publicLeaderboardEligible: false`;
- `rewardEligibility: false`;
- `mentorDecisionEligible: false`;
- `instructorDecisionEligible: false`;
- `scholarshipEligibility: false`.

No XP, Badge, financial reward, funded-account decision, Mentor action or Instructor grant may consume this score until a separate reviewed authority explicitly defines that use.

## UI language

The UI must call the result **امتیاز خصوصی انضباط ژورنال** or **Journal Discipline Score**.

Before consent, the UI must explain that:

- computation is default off;
- explicit learner approval is required;
- scoring consent is independent from public visibility;
- no estimate or browser fallback exists.

It must not call the result:

- overall reputation;
- trader score;
- profitability score;
- risk score;
- public rank;
- scholarship score.

The public Leaderboard remains locked and empty.

## Policy evolution

Any change to weights, minimum cycles, lookback, source set, rounding, consent semantics, status semantics or allowed downstream use requires a new policy version and a separate migration/compatibility decision. Historical v1 results must remain reproducible from the immutable evidence window and canonical digest.

## Failure behavior

The projection fails closed when:

- principal binding is missing or revoked;
- database authority is unavailable;
- scoring consent authority is unavailable or corrupt;
- a source row has corrupt identity, time, counts, completion or digest;
- duplicate cycles or source identities appear;
- canonical ordering is violated;
- the API or client payload contains unknown or contradictory fields.

Absent consent returns an explicit consent-required state and no score. No browser fallback or synthetic score is permitted.
