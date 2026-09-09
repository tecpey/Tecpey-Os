# Student identity across session issuance — wave 4

2026-09-07. Candidate implementation. No production or staging deployment.

Password login, 2FA completion and refresh now use a shared read-only resolver
before signing an access token. Session admission/rotation and revocation remain
the authorities that must complete before cookies are published.

Automatic resolution requires all of:

1. Account ID from the existing verified authentication flow.
2. Persisted account phone verification, nonempty email and phone.
3. Exactly one student candidate across the account's email/phone matches.
4. That candidate matching both email and phone exactly.
5. Request-tenant assertion and an active binding for that student.

No student or binding is created by login or refresh. No client-supplied username,
student ID, email or phone is used as evidence by this resolver. Partial matches,
ambiguity, foreign hosts and revoked bindings require review (409). Storage
failure returns 503. Accounts without verified matching evidence remain
account-only; legacy profiles are NOT silently migrated or certified.

## Verification

- Eight resolver/control-flow tests cover exact match, absent match, partial and
  duplicate candidates, foreign tenant, revoked/missing binding, storage outage,
  asserted workspace propagation and wiring of all three issuers.
- Twenty combined resolver, identity-selection, Arena-access and access-token TTL
  tests passed. Targeted lint and existing session authority guard passed.
- Added a PostgreSQL query regression for unverified vs verified phone,
  account-ID isolation and multiple candidates, with rollback.
- Local PostgreSQL setup was blocked by OS setgroups/setuid permissions during
  package preparation. Those restrictions were not changed or bypassed.
- Database tests, live login/refresh/2FA and browser acceptance remain required.
- Historical ownership records need review; exact matching is not a retrospective
  audit of old data. Tenant-domain resolution retains the existing resolver's
  semantics and must also be covered in database integration.

## Review scope

This candidate depends on wave 3's removal of editable identity claims and
username-based selection. It must not be cherry-picked without that hardening.
Before merge: run migrated PostgreSQL/Redis integration, verify expired and
revoked refresh paths, complete live FA/EN account recovery, and confirm the
appropriate support flow for legacy or conflicting identities. Do not label the
platform or identity rollout ready from the passing unit tests alone.
