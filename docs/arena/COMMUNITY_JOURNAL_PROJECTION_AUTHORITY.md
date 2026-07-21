# TecPey Community Journal Projection Authority

Issue: #214  
Parent: #160

## Purpose

The Community journal feed is a privacy-minimized projection of canonical Trading Arena reflections. It is not a second journal database, a browser cache promoted to truth, or a simulated community surface.

## Authority chain

1. A learner closes a trade through the server-authoritative Trading Arena execution aggregate.
2. The learner saves a reflection through `/api/trading-arena/reflections`.
3. PostgreSQL binds the reflection to the learner and Arena attempt through composite ownership constraints and immutable closed-trade evidence.
4. Community sharing is controlled only by the revisioned `academy_public_profiles.journal_sharing_enabled` consent authority.
5. `/api/community/profile?view=journal-feed` resolves a strict canonical session and verified tenant/workspace/principal context.
6. The feed reads only consented reflections from the same tenant and workspace.

## Public projection

The feed may expose only:

- a domain-separated public entry identifier;
- a domain-separated anonymous author alias;
- the Arena asset;
- the learner's bounded and identifier-redacted lesson learned;
- controlled mistake tags;
- the bounded and identifier-redacted next-action commitment;
- server-owned closed and updated timestamps;
- whether the entry belongs to the current viewer.

The feed must not expose:

- internal student, principal, attempt, trade or reflection identifiers;
- exact balance, position size, realized PnL or PnL rate;
- decision-review or emotional-review text;
- email, phone, wallet address, bearer/session token, API key or private-key material from free text;
- consent revision or evidence metadata;
- browser-generated IDs, timestamps, scores or journal records;
- demo or fabricated community entries.

## Consent semantics

`journal_sharing_enabled` defaults to `false`. Sharing is admitted only when:

- the profile is bound to an active tenant/workspace/principal binding;
- consent has a committed timestamp;
- the current consent version is `community-profile-consent-v1`;
- the flag is currently enabled.

Disabling consent removes the learner's entries from subsequent feed reads without deleting the private Arena reflections.

## Pagination

The feed uses an opaque cursor over the immutable ordering pair:

1. `evidence_closed_at DESC`
2. `reflection.id DESC`

The route bounds page size to 1–50 and rejects malformed cursors. Under a stable dataset, sequential pages cannot duplicate or skip entries.

## Failure behavior

- Missing Academy identity returns `401`.
- Invalid view, page limit or cursor returns `400`.
- Missing tenant/principal authority or PostgreSQL unavailability returns `503`.
- The UI never falls back to localStorage, demo entries, filesystem data or client-generated journal state.

## API governance

The journal feed reuses the existing Community profile route as a read-only `journal-feed` view. This avoids adding a second Route Handler file solely for a GET projection and preserves the immutable API Security Manifest baseline. The existing PATCH operation remains governed through its exact reviewed delta ledger.

## Explicitly out of scope

- Instructor access or grants;
- public internet discovery;
- per-entry sharing controls;
- comments, reactions or social ranking;
- official challenges, rewards, scholarships or leaderboards;
- deletion of quarantined historical journal code still referenced by historical, non-primary UI.
