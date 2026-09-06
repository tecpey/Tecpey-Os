# TecPey Product Session Boundary v1

## Decision

TecPey Core and TecPey Exchange share one canonical TecPey identity and may run on the same backend infrastructure, but they do **not** share browser session authority.

- Core keeps its existing unified session authority.
- Exchange receives a dedicated product session with a dedicated signing secret, issuer/audience contract and role/version claim.
- Exchange cookies are host-only. No `Domain=.tecpey...` cookie is permitted.
- A copied Core token must fail Exchange verification even when both products are served by the same codebase/server.
- A copied Exchange token must not authorize Core or another product.
- Exchange financial mutations require a fresh AAL2 step-up in addition to an active Exchange product session.
- Browser sessions are BFF sessions, not portable financial API bearer tokens. Future Exchange BFF → financial-resource-server access should use the FAPI 2.0 profile with sender-constrained access tokens (DPoP or mTLS), PAR and narrowly-scoped authorization.

## Why this boundary exists

A shared backend is operationally efficient and enables Mentor/Academy integration, but a shared browser credential would collapse the security boundary between education and custody/execution. Product separation therefore lives at the authorization/session layer rather than requiring separate databases or servers on day one.

## Identity model

```text
platform_principals                 canonical identity
        |
        +-- Academy product account -- Core browser session
        |
        +-- Exchange product account -- Exchange browser/BFF session
                                            |
                                            +-- fresh AAL2 step-up for money movement
                                            +-- future sender-constrained API token
```

Account linking remains consented and explicit. KYC contributes assurance but is never an auto-link key. Mentor receives only consented read-only derived signals.

## Exchange session claims

Exchange sessions intentionally contain no email, phone, name, national ID, raw KYC data, wallet secret or API credential. Required claims are limited to:

- tenant id
- canonical principal id
- Exchange product-account id
- authentication assurance (`aal1` / `aal2`)
- bounded authentication methods (`amr`)
- authentication time
- optional financial step-up time
- JTI, issuer, audience, expiry and product-session version

## Crypto / runtime posture

v1 follows the repository's existing `jose`-based JWT runtime but uses a **separate Exchange secret** (`TECPEY_EXCHANGE_SESSION_SECRET_V1`) with a minimum 32-byte value. Production fails closed when the secret is missing/short. The token is accepted only with:

- algorithm `HS256`
- protected `typ=tecpey-exchange-session+jwt`
- issuer `urn:tecpey:identity`
- audience `urn:tecpey:exchange:bff`
- role `exchange_product_session`
- schema version `1`
- durable JTI registration and strict revocation authority

The browser-session JWT is not a claim of FAPI conformance. FAPI 2.0 applies to the future protected API boundary between the Exchange BFF and high-value financial resource servers.

## Session lifecycle

- access-session TTL defaults to 15 minutes and is bounded to 5–30 minutes;
- session issuance is returned to the caller only after durable JTI registration succeeds;
- revocation authority unavailability fails verification closed;
- Exchange session registry ownership is namespaced as `exchange:<tenant>:<principal>`, so bulk Exchange revocation does not accidentally collapse Core browser sessions;
- account-compromise workflows may deliberately revoke both product namespaces through a higher-level identity incident workflow.

## Financial step-up

A normal Exchange session can render non-mutating account surfaces. Financial authorization additionally requires:

- session assurance `aal2`;
- a step-up timestamp no older than 5 minutes by default;
- step-up timestamp not materially in the future;
- step-up performed at or after the base authentication event.

Order execution, withdrawal, custody signing and other high-risk mutations remain subject to their existing dedicated policy/risk/idempotency/audit gates. This session boundary does not replace those controls.

## Standards basis

The architecture is aligned with the current security direction of OAuth 2.0 Security BCP (RFC 9700) and the OpenID Foundation FAPI 2.0 Security Profile (Final, 2025). For future cross-service/API delegation, TecPey should use PAR (RFC 9126), Rich Authorization Requests (RFC 9396), sender-constrained tokens such as DPoP (RFC 9449) or mTLS, and Shared Signals/CAEP for continuous session-risk propagation.

These are implementation targets; TecPey does not claim certification until conformance testing is completed.
