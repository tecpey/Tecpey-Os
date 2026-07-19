# TecPey Mutating API Security Manifest Policy

## Authority

Every exported `POST`, `PUT`, `PATCH`, or `DELETE` handler under `src/app/api/**/route.ts` must be represented in the generated API security manifest.

The manifest is generated from repository source, committed as deterministic evidence, and verified in CI. A new or changed mutation cannot enter `main` without regenerating the manifest and satisfying policy or receiving an explicit, owner-approved, time-bounded exception.

## Required evidence

Each operation records:

- route and method;
- source file and source hash;
- public, authenticated, admin, or internal classification;
- principal and tenant source evidence;
- risk classes;
- CSRF, strict-revocation, rate-limit, body-size, content-type, parser, idempotency, transaction, cache, audit, redaction, and fail-closed evidence;
- responsible domain owner;
- discovered test references;
- machine-generated findings.

## Non-negotiable checks

The permanent CI gate must reject:

- a missing or stale operation;
- cookie-authenticated mutation without same-origin CSRF protection;
- financial, credential, privacy, admin, or AI-memory mutation without strict session revocation;
- unbounded request bodies;
- public mutations without rate limiting;
- replayable financial or learning-progress commands without idempotency;
- missing verified principal evidence;
- private mutation responses without explicit no-store/private caching;
- internal mutations without service-identity evidence.

Existing debt may only remain through an explicit exception containing an accountable owner, reason, compensating control, issue reference, and expiry date. Expired exceptions fail CI.
