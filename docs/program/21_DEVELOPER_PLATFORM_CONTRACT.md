# Developer Platform — Public API, SDKs, OAuth and Webhooks

**Base:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** #716 tenant authority for enterprise clients; #698 identity/session; #713 compliance for regulated resources. Public developer access remains disabled until this track is certified.

## Objective
Turn TecPey's internal `/api` surface into a deliberately versioned developer platform instead of exposing implementation routes accidentally.

## Standards anchors
- OpenAPI current specification family (3.2.x / 3.1.x): https://spec.openapis.org/oas/
- OAuth 2.0 Security BCP RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- HTTP Problem Details RFC 9457: https://www.rfc-editor.org/rfc/rfc9457
- CloudEvents: https://cloudevents.io/
- OWASP API Security Top 10: https://owasp.org/projects/api-security-project

## Deliverables
- explicit public API inventory/version namespace; internal routes are not public by default;
- OpenAPI source-of-truth generated/validated in CI against runtime handlers;
- stable problem/error model using RFC 9457 semantics where appropriate;
- OAuth/client credential/token design aligned with RFC 9700; exact redirect matching, no open redirectors, bounded scopes/audiences;
- tenant/workspace/scopes enforced server-side on every object/property/function access;
- idempotency for public mutating commands;
- rate/quota policy by client, tenant, route class and expensive operation;
- pagination/cursor/filter conventions and deterministic precision formats;
- webhook/event subscription authority with signed delivery, replay window, retry/backoff, idempotent event IDs and dead-letter visibility;
- CloudEvents-compatible envelope or equivalently versioned TecPey envelope;
- SDK generation for TypeScript first, with compatibility tests against spec and examples;
- key/client lifecycle: create, rotate, revoke, last-used metadata, audit; raw secrets shown once only;
- sandbox/test environment separated from real-money authorities;
- changelog/deprecation/sunset policy; no breaking silent changes.

## Security tests
BOLA/BOPLA/function-level authorization, resource exhaustion, SSRF through callbacks, unsafe upstream consumption, leaked/replayed credentials, webhook replay/forgery, cross-tenant object IDs and inventory drift.

## Acceptance
A client generated from the committed OpenAPI spec can complete supported sandbox flows, while undocumented/internal routes remain inaccessible as public developer contracts.
