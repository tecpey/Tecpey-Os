# API Security Manifest Scope

Included in the first mandatory inventory:

- every `POST`, `PUT`, `PATCH`, and `DELETE` export in `src/app/api/**/route.ts`;
- all public, authenticated, admin, and internal mutations;
- static evidence for authentication, authorization, CSRF, revocation, rate limiting, body limits, idempotency, transactions, caching, audit, redaction, dependency failure, tenant ownership, and tests.

The scanner deliberately excludes non-route helpers and documentation candidates even when they contain matching function names.
