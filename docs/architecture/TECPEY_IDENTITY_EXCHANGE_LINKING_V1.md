# TecPey Identity, Exchange Linking & Mentor Data Boundary v1

Status: Architecture authority for staged implementation

## Decision

TecPey Core and TecPey Exchange are separate products with separate public origins and separate product sessions, but they resolve to one canonical TecPey identity plane.

The architecture is:

- one canonical `platform_principals` identity per human within a tenant;
- distinct Academy and Exchange product accounts linked to that principal;
- no cross-domain browser cookie sharing;
- no automatic linking based only on matching email, phone or KYC data;
- explicit, reversible and audited account linking;
- Exchange remains the authority for KYC workflow, financial sessions, custody, orders, withdrawals, deposits and reconciliation;
- Core may consume a minimized KYC assurance assertion and consented read-only Exchange intelligence;
- Mentor never receives custody keys, Exchange credentials, API secrets, raw KYC documents or write authority over financial operations.

This lets TecPey keep the commercial and UX advantages of a connected ecosystem while preserving a strong financial-security boundary.

## Why this model

Treating Academy and Exchange as completely unrelated identities would destroy the highest-value loop in the product: learning → practice → real behavior → Mentor feedback. Treating them as one browser session or one financial authority would create an unacceptable blast radius.

The chosen model is therefore **shared identity, distinct product accounts, isolated financial authority**.

A user may have:

1. a TecPey principal only;
2. a TecPey principal + Academy account;
3. a TecPey principal + Exchange account;
4. one TecPey principal with both product accounts linked.

The principal is the durable identity root. Product accounts are capabilities attached to it, not substitutes for it.

## Standards target

The implementation should converge on current financial-grade identity and authorization patterns rather than invent a proprietary cross-domain login protocol.

Primary references:

- OAuth 2.0 Security Best Current Practice — RFC 9700
- OAuth 2.0 for Browser-Based Applications — RFC 10017
- FAPI 2.0 Security Profile — OpenID Foundation Final, 2025
- FAPI 2.0 Message Signing — OpenID Foundation Final, 2025
- OAuth 2.0 Pushed Authorization Requests — RFC 9126
- OAuth 2.0 Rich Authorization Requests — RFC 9396
- OAuth 2.0 Step Up Authentication Challenge Protocol — RFC 9470
- OAuth 2.0 Token Exchange — RFC 8693
- OAuth 2.0 Demonstrating Proof of Possession — RFC 9449
- OpenID Connect for Identity Assurance / verified claims 1.0
- OpenID Shared Signals Framework and CAEP 1.0
- NIST SP 800-63-4 Digital Identity Guidelines

These are targets for the governed implementation. A constant naming a standard does not claim current conformance or certification.

## Browser and session architecture

Both web applications should use a Backend-for-Frontend pattern for sensitive OAuth responsibilities. Browser JavaScript must not become the long-lived bearer-token vault.

Core session and Exchange session are separate.

- Core browser session authenticates Core/Academy capabilities.
- Exchange browser session authenticates Exchange capabilities.
- A Core session is never accepted by a financial resource server as authorization for trading, custody, deposits or withdrawals.
- Exchange may use the shared identity provider to authenticate the human, then creates its own product session and applies its own eligibility and risk checks.
- Cross-registrable-domain cookies are not used to simulate SSO.

SSO is achieved by redirect-based identity federation, not cookie sharing.

## Account-linking ceremony

Account linking is a security-sensitive authorization ceremony, not a database convenience.

Required sequence:

1. User starts “Connect Exchange account” from Core or “Connect Academy” from Exchange.
2. The initiating BFF creates a one-time linking transaction bound to the authenticated principal, product, intended scopes, state, expiry and return URI.
3. The browser is redirected to the other product through the authorization server.
4. The other product requires an authenticated session and step-up authentication appropriate to the risk policy.
5. The user is shown exactly what will be linked and what data may be shared.
6. The user grants explicit consent.
7. Authorization code + PKCE is completed through the BFF; exact redirect URI matching is mandatory.
8. Server-side code verifies state, nonce where applicable, issuer, audience, code binding, expiry and replay protections.
9. A durable link is written against the same canonical `platform_principals.id`.
10. An append-only consent event and security audit event are written.
11. Both products show the connection and the scopes in Settings.
12. Revocation immediately invalidates delegated Mentor/Core access but does not delete Exchange records that must be retained for legal, security or accounting reasons.

### Linking shortcuts that are forbidden

Never link accounts solely because any of these values match:

- email;
- phone number;
- legal name;
- national identifier;
- KYC provider applicant ID;
- device fingerprint;
- IP address.

Those may be risk signals or recovery evidence, but they are not sufficient authorization to bind two product accounts. This prevents account-takeover and identity-collision failures.

## KYC architecture

Exchange owns the KYC workflow and raw evidence because KYC is part of financial eligibility.

Core may receive only a minimized assurance record such as:

- `status`;
- `assurance_level`;
- `jurisdiction`;
- `verified_at`;
- `expires_at`;
- a non-sensitive provider/framework identifier when operationally required.

Core and Mentor must not receive:

- identity-document images;
- selfie/liveness media;
- raw biometric templates;
- provider API secrets;
- full KYC case files;
- unrestricted national-identity data.

The shared representation should follow the concepts of OpenID Identity Assurance `verified_claims` rather than copying provider-specific JSON across the platform.

KYC status may help prove that the linked Exchange account belongs to the same verified human, but KYC is not the account-linking mechanism itself.

## Mentor ↔ Exchange boundary

Mentor value comes from interpreting behavior, not controlling money.

Default state: disconnected.

After explicit consent, Mentor may receive derived, read-only intelligence such as:

- portfolio risk summary;
- concentration risk;
- realized/unrealized performance summary where approved;
- drawdown summary;
- behavioral risk signals;
- trading-frequency or revenge-trading indicators;
- rule-discipline signals;
- activity summary;
- differences between Trading Arena behavior and real Exchange behavior.

The preferred architecture is Exchange → policy-controlled projection → Mentor, rather than Mentor querying raw trading tables directly.

Mentor must not receive authority for:

- create order;
- cancel order;
- withdrawal;
- deposit instruction;
- wallet signing;
- custody/private keys;
- Exchange password/session cookie;
- API secret;
- raw KYC documents.

If a future product allows “Mentor-assisted execution”, that must be a new high-risk product decision with a separate approval model. It is not implicitly enabled by account linking.

## Consent model

Financial-data consent must not be conflated with marketing or notification preference consent.

A dedicated append-only consent ledger should record at minimum:

- canonical principal id;
- granting product;
- receiving product/service;
- exact scopes/authorization details;
- grant/revoke status;
- policy version;
- jurisdiction;
- authenticated ceremony id;
- correlation id;
- granted/revoked timestamps;
- optional expiry;
- hash/fingerprint of the request context.

Current effective consent is a projection of the append-only events.

Users must be able to see and revoke links from both products.

## Authorization scopes

Initial Mentor-safe scopes:

- `exchange.profile.summary.read`
- `exchange.kyc.status.read`
- `exchange.portfolio.risk_summary.read`
- `exchange.activity.summary.read`
- `exchange.behavior.risk_signals.read`
- `exchange.performance.summary.read`

Explicitly forbidden for Mentor/Core delegation:

- `exchange.orders.write`
- `exchange.orders.cancel`
- `exchange.withdrawals.write`
- `exchange.deposits.write`
- `exchange.wallet.sign`
- `exchange.custody.keys.read`
- `exchange.kyc.documents.read`
- `exchange.credentials.read`
- `exchange.api_keys.secret.read`

Scope names are internal policy vocabulary. The authorization server may later represent them as OAuth scopes and/or RFC 9396 authorization details.

## Service-to-service delegation

Mentor should not retain the user’s general Exchange access token.

When a read-only projection is requested, the system should issue an audience-restricted, short-lived delegated token for the specific resource server. OAuth Token Exchange is the target model for this attenuation.

For high-value APIs, sender-constrained access tokens using DPoP or mTLS are the target. Tokens are stored server-side in the BFF/service layer, not localStorage.

## Step-up authentication

Linking, consent changes and sensitive Exchange operations require recent authentication appropriate to the risk.

Exchange resource servers must be able to reject a token/session that does not meet authentication-strength or recentness requirements and request step-up. RFC 9470 is the interoperability target.

TecPey may support TOTP where platform constraints require it, but manual OTP is not described as phishing-resistant. Phishing-resistant authenticators should be offered where available and operationally viable.

## Continuous security signals

A link cannot be treated as permanently trustworthy just because login succeeded once.

The identity plane needs security-state propagation for at least:

- session revoked;
- credential changed;
- assurance/KYC level changed;
- account suspended/disabled;
- product link revoked;
- material device/risk posture change when applicable.

OpenID Shared Signals / CAEP is the target event model. An internal transactional outbox may implement delivery first, but event semantics should remain compatible with continuous attenuation.

A material security signal must be capable of reducing or revoking access without waiting for the original token to expire.

## Data and process isolation

The first production version may run on the same physical server to control cost, but “same server” must not mean “same authority”.

Required logical isolation:

- separate BFF/product sessions;
- separate signing/audience boundaries;
- separate DB roles for financial mutations;
- explicit schemas/service repositories for financial domain access;
- no Core direct SQL access to raw custody/KYC/trading tables;
- service APIs/projections for cross-domain data;
- independent audit trails;
- independent risk and compliance gates;
- separate secrets and key scopes;
- ability to move Exchange services to a different host/cluster later without changing the public account-linking contract.

This is a modular-monolith-to-services migration posture: keep operational cost low now while preserving hard seams for future scale and regulation.

## Existing TecPey assets to reuse

Do not create a second identity root if the existing authority can be evolved safely.

Existing building blocks already present in the repository include:

- `platform_principals` tenant-scoped principal registry;
- Academy credential authority;
- unified/canonical session code;
- durable user session and refresh-family registry;
- known-device registry;
- sensitive mutation audit;
- notification consent append-only pattern;
- compliance provider adapters including KYC interfaces.

The identity-plane implementation should extend these intentionally rather than bypassing them.

## Required implementation waves

### Wave A — authority and regression contracts

- identity-linking authority;
- Exchange boundary v2;
- standards ADR;
- tests proving no financial authority leaks to Core/Mentor.

### Wave B — identity-plane persistence

Add migration-backed structures for:

- product-account bindings;
- account-linking transactions;
- append-only financial-data consent events;
- minimized identity-assurance records;
- current-link/current-consent projections.

Migration must be checksum-protected and added to the canonical migration registry.

### Wave C — linking API

Build server-side endpoints for:

- initiate link;
- authorize/approve link;
- callback/complete link;
- list links and grants;
- revoke link/grant;
- security event attenuation.

All state-changing endpoints require CSRF/origin controls, bounded bodies, rate limits, idempotency where relevant and sensitive mutation audit.

### Wave D — Exchange read projection for Mentor

Create a dedicated projection service/API. No direct Mentor SQL access to raw Exchange domain tables.

### Wave E — UI

Settings in Core and Exchange must show:

- linked product;
- account state;
- KYC assurance state (minimal);
- scopes shared;
- last sync/security state;
- revoke/disconnect action;
- clear distinction between disconnecting data access and closing an Exchange account.

### Wave F — continuous security and observability

- outbox-delivered security signals;
- correlation ids across identity/link/consent events;
- dashboards and alerts for failed/replayed link ceremonies;
- audit evidence for revoked grants;
- no silent fallback on security-state propagation failure.

## Non-goals

This architecture does not:

- activate real-money Exchange for public launch;
- choose the final Exchange domain;
- claim FAPI certification;
- permit Mentor trading on behalf of the user;
- expose raw KYC evidence to Core;
- merge Academy and Exchange browser sessions;
- make TecPey Exchange rank higher in comparison pages because it is affiliated.

## Definition of done

The connected-account feature is not complete until:

- threat model and authority tests pass;
- migration and rollback/recovery evidence exist;
- link/revoke flows have adversarial tests for replay, CSRF, account substitution, stale consent, expired code and wrong audience;
- sessions are separate by product;
- consent is inspectable and reversible;
- KYC sharing is minimized;
- Mentor scopes are read-only and technically unable to mutate financial state;
- security-signal revocation works;
- all CI gates are green on the exact head;
- staging evidence confirms the user sees and controls the link from both products.
