# Community Reputation Scoring Consent Authority

Issue: #235  
Parent: #160  
Journal Discipline policy: #233 / PR #236  
Ranking policy gate: #232 / PR #234  
Public ranking successor: #226

## Status

**Consent authority active in this change. Public ranking remains disabled.**

This authority controls whether TecPey may compute the authenticated learner's private Community reputation-related score. It is default off and independent from public profile or Leaderboard visibility.

The first governed consumer is the private Journal Discipline Score v1. No evidence window is selected and no score is calculated until explicit consent is active.

This authority does not create public rank, percentile, rewards, scholarships, funded accounts, Mentor decisions, Instructor grants, employability claims or financial controls.

## Why consent is separate

The existing Community profile consent includes `leaderboard_visible`, but public disclosure is not valid consent for private profiling.

TecPey therefore preserves two independent decisions:

```text
private reputation scoring consent
public leaderboard visibility
```

The private scoring decision is stored in a separate one-to-one authority so that:

- historical `community-profile-consent-v1` is never reinterpreted as profiling permission;
- all existing and new learners start opted out;
- public profile or Leaderboard visibility cannot silently enable scoring;
- scoring consent cannot silently expose a learner publicly;
- each authority has independent revision and evidence history;
- future public ranking can prove both boundaries explicitly.

## Version identity

Consent version:

```text
community-reputation-scoring-consent-v1
```

Authority version:

```text
community-reputation-scoring-consent-authority-v1
```

Changing default state, purpose, allowed consumers, identity binding, revision semantics or downstream use requires a separately reviewed version transition. Historical decisions must never be silently reinterpreted under a new purpose.

## PostgreSQL authority

Table:

```text
academy_community_reputation_scoring_consents
```

Each row belongs to exactly one immutable:

- Community public profile identity;
- tenant;
- workspace;
- student principal;
- Academy student.

Stored fields are limited to:

- enabled state;
- revision;
- consent version;
- latest decision timestamp;
- creation and update timestamps.

The table stores no score, rank, PnL, trade, order, balance, Reflection text, contact data, Mentor output or Instructor output.

Existing profiles are backfilled with:

```text
enabled = false
revision = 0
consented_at = null
```

New profiles receive the same default through a PostgreSQL trigger.

## Identity and revision protection

PostgreSQL rejects changes to:

- public profile identity;
- tenant/workspace identity;
- principal/student identity;
- creation timestamp.

A changed decision must:

- advance revision by exactly one;
- preserve the fixed consent version;
- set a database-owned decision timestamp.

A no-op must not advance revision or fabricate new evidence.

## Mutation API

The existing governed Community route exposes:

```text
GET /api/community/profile?view=reputation-scoring-consent
PATCH /api/community/profile?view=reputation-scoring-consent
```

The PATCH body is exact:

```json
{
  "expectedRevision": 0,
  "reputationScoringEnabled": true
}
```

Controls:

- strict canonical session revocation;
- Academy student profile required;
- verified tenant/workspace/student principal context;
- scope `community:profile:read` or `community:profile:write`;
- CSRF origin verification for mutation;
- bounded exact JSON parsing;
- mandatory idempotency key;
- bounded rate limiting;
- PostgreSQL advisory and row locking;
- optimistic revision control;
- transaction-coupled sensitive mutation audit;
- private/no-store response;
- fail-closed dependency behavior.

Unknown, missing or invalid fields are rejected.

## Exact replay

A committed command can be replayed only when all remain identical:

- tenant and actor identity;
- resource identity;
- request hash;
- expected and committed revision;
- requested enabled state;
- consent authority and version;
- current stored result.

Changed key reuse or divergent state returns an idempotency conflict.

## Mandatory audit evidence

Changed decisions reuse the governed mutation action:

```text
community.profile.consent.update
```

with authority metadata:

```text
community-reputation-scoring-consent-authority-v1
```

The evidence records:

- authority and consent version;
- privacy-safe principal fingerprint;
- expected revision;
- committed revision;
- resulting enabled state.

Mutation and evidence commit in one transaction. Audit failure rolls back the consent change.

## Journal Discipline Score gate

The Journal Discipline Score authority proves, inside its read-only transaction:

1. the principal binding is active;
2. an exact consent row exists for that tenant/workspace/principal;
3. `enabled = true`;
4. consent version is canonical;
5. a decision timestamp exists.

Only then may the authority select immutable evidence and calculate the score.

When consent is absent or disabled:

```text
available = true
consentRequired = true
score = null
```

The HTTP route returns:

```text
409 journal_discipline_score_consent_required
```

No evidence window, counts, digest or score are returned.

A revoked binding remains a fail-closed authority error and is not misreported as missing consent.

## Independence from public visibility

The scoring authority never reads or writes `leaderboard_visible`.

The Community profile consent authority never reads or writes private scoring consent.

Result matrix:

```text
scoring off + public hidden  -> no private score, no public rank
scoring off + public visible -> no private score, no public rank
scoring on  + public hidden  -> private Journal Discipline score may be computed
scoring on  + public visible -> private score only; public rank still disabled
```

## Legacy career boundary

`community-career.ts` and Hall-of-Fame-derived values are explicitly marked:

```text
preview-only
```

They are not Reputation Ranking v1 and do not consume the scoring consent authority or immutable reputation evidence.

Legacy XP, terms, streaks, Mentor preview values or career calculations must not become:

- Journal Discipline Score;
- official reputation score;
- public rank;
- trading-skill or profitability claim;
- scholarship or funded-account eligibility;
- Mentor or Instructor decision;
- employability or financial-risk authority.

## Client and UI boundary

The score client distinguishes:

- consent required;
- authority unavailable;
- insufficient evidence after consent;
- available score after consent and sufficient evidence.

Before consent, the UI states that:

- scoring is default off;
- explicit approval is required;
- public visibility is independent;
- no browser fallback or estimated score is produced.

This change does not infer or auto-enable consent from any prior participation.

## Failure behavior

- missing or inactive binding: fail closed;
- absent/disabled consent: explicit consent-required state;
- stale revision: conflict;
- changed idempotency replay: conflict;
- database unavailable: no false success;
- audit failure: mutation rollback;
- local browser mutation: no authority;
- public visibility enabled: no private scoring permission;
- consent enabled but insufficient evidence: no premature score;
- consent revoked: future computation stops immediately.

## Testing and permanent guards

Evidence covers:

- default-off backfill and new-profile creation;
- clean and idempotent migration;
- scoring/public-visibility independence;
- revision, no-op and exact replay behavior;
- changed replay and stale revision conflicts;
- tenant and principal isolation;
- mandatory transaction-coupled audit metadata;
- Journal Discipline computation blocked before consent;
- computation available only after consent;
- revocation blocks computation again;
- inactive principal binding remains fail closed;
- client/UI consent-required state;
- preview-only legacy career boundary;
- no public rank or downstream decision activation.

## Remaining product gates

Public Community ranking remains blocked until:

1. Ranking Policy v1 is explicitly approved;
2. public visibility and scoring consent are both independently proven;
3. snapshot, cohort privacy, pseudonym and rollback authorities are implemented;
4. shadow-mode evidence is accepted;
5. no reward, Mentor, Instructor or financial use is inferred from a private score.
