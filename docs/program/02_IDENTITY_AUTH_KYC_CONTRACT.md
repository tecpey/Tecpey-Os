# Identity: Auth, regional fallback, KYC + certificate identity authority

**Base main:** `e16f9cc4254bb556c2a1235baa5cbd24ff0fea2b`

**Dependencies:** Program Map. Independent of Commerce implementation, but Commerce consumes its identity/session authority.

## Global quality bar

Every implementation under this program is governed by the following non-negotiable rules:

- **Authority first:** security-, entitlement-, identity-, mastery-, rank-, payment- and personalization-sensitive state is server-owned, tenant-bound and fail-closed. Client state can render authority but cannot create it.
- **No fabricated intelligence:** no synthetic mastery, risk, rank, subscription, confidence, live market value or AI capability may be presented as fact without a named authority and freshness/provenance.
- **Design:** content-first hierarchy. Translucent/glass treatment is reserved for navigation, controls and lightweight overlays; never glass-on-glass or decorative transparency that competes with content.
- **Accessibility:** WCAG 2.2 AA minimum, 44px preferred primary touch targets, visible keyboard focus, no focus obscured by sticky UI, semantic landmarks, reduced-motion and reduced-transparency-safe behavior, screen-reader states for loading/error/degraded/locked.
- **Localization:** FA/EN parity in the same PR, correct RTL/LTR semantics, logical CSS properties, bidi isolation for identifiers/numbers, no English-only operational dead ends.
- **Security:** strict schema validation, bounded payloads, CSRF for mutations, rate limiting, tenant/workspace authorization, session/revocation checks, idempotency/replay defense, audit trail and negative tests.
- **Privacy:** data minimization; self-reported notes never silently become inferred traits; sensitive profile changes require explicit authority and user-facing explanation.
- **Observability:** structured logs, correlation IDs, explicit degraded modes, freshness timestamps, provider/authority reason codes and bounded telemetry.
- **Testing:** TypeScript, ESLint, unit, integration, negative/security tests, repository audit classification, public browser golden path, mobile/desktop FA/EN evidence, exact-head CI.
- **Release:** immutable exact-SHA artifact, staging-first, health + smoke + rollback proof, Production untouched until a separate explicit release decision.

### Research anchors

This program is informed by current primary guidance: Apple Liquid Glass/HIG content-first hierarchy and reduced motion/transparency; WCAG 2.2 focus/target criteria; Rive Data Binding/ViewModel/MVVM; current OpenAI Responses web-search/citation patterns; Anthropic citation-enabled web search with dynamic filtering; xAI Web/X Search; and evidence on spacing + retrieval practice for durable learning. External provider names/models remain registry data, not hard-coded product architecture.


## Objective

Unify login/register, second-factor choices, identity verification and certificate identity under one auditable lifecycle.

## Deliverables

- Apple + Google provider configuration with admin-visible readiness and safe disabled states.
- Regional auth policy: password/email/SMS/TOTP remain first-class where platform passkeys/Apple 2FA are impractical; no forced WebAuthn-only path.
- Limoo Pattern OTP authority: server-generated cryptographic code, digest-only storage, bounded expiry/attempts/resend, pattern ID validation, abuse rate limits.
- Resend email OTP/recovery with equivalent replay/expiry controls.
- TOTP enrollment/recovery lifecycle; no secret exposure after enrollment.
- Session inventory + revoke-one/revoke-all, device metadata minimization and audit trail.
- Identity verification state machine: unstarted → pending → needs_action → verified / rejected / expired; reviewer actions audited.
- Document metadata separation from public profile; storage ownership checks and short-lived access.
- Certificate identity authority: display name vs legal/certificate name; passport/ID fields only when required for governed certificate issuance.
- User-facing privacy/explanation surfaces in FA/EN.
- Login/Register redesign using content-first hierarchy, predictable social actions, clear regional fallback and accessible error/retry states.
- KYC must not block Academy learning unless a downstream regulated capability explicitly requires it.

## Research-derived identity/session controls

Current NIST SP 800-63B-4 (2025) supersedes the older SP 800-63B and reinforces that authentication is an authenticator **lifecycle**, not merely a login form. OWASP likewise treats a session token as equivalent to the strongest authenticator used and recommends strict server-side lifecycle controls.

Primary references:
- https://csrc.nist.gov/pubs/sp/800/63/b/4/final
- https://www.nist.gov/identity-access-management/projects/nist-special-publication-800-63-digital-identity-guidelines
- https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

Implementation consequences:
- session IDs/tokens are opaque and never contain PII or authorization truth;
- browser session transport uses secure HttpOnly cookies with explicit SameSite policy; auth/session secrets never live in localStorage/sessionStorage;
- sessions rotate after login, MFA enrollment/change, password/email change, recovery and privilege/role changes;
- idle + absolute timeout are enforced server-side; revoke-one/revoke-all invalidates server authority, not only a browser cookie;
- sensitive account recovery and identity changes require step-up/reauthentication and generate high-risk audit events;
- concurrent-session inventory exposes bounded device/time metadata and allows remote revocation without leaking raw session IDs;
- SMS/email OTP are recovery/verification channels with explicit assurance limits; they do not silently become stronger authenticators than policy permits;
- passkey/WebAuthn support is capability-based and optional by region/device; lack of platform availability cannot lock a legitimate user out of secure TOTP/password/SMS/email recovery paths;
- KYC/identity-proofing state is separate from authentication assurance: “authenticated” never implies “identity verified”.

## Security / abuse

- CSRF/rate-limit all mutations; brute-force protection; session rotation after privilege/2FA changes.
- Identity-provider claims are verified server-side.
- No raw OTP/TOTP secret in logs.
- No KYC document content in analytics or Mentor context.
- Account recovery changes require high-risk audit events.

## Acceptance

All auth pathways have positive + negative integration tests; regional fallback is usable without passkeys; KYC/certificate status is authoritative, explainable and privacy-bounded.


## Delivery discipline

This Draft PR starts as an implementation contract. Code, migrations, tests and evidence are added to this same branch; the PR does not become Ready until every acceptance criterion above is either implemented or explicitly split into a named follow-up PR. Scope reductions must be documented in the PR body; they may not be silently dropped.

## Release boundary

No merge, Staging mutation or Production mutation is authorized merely by opening this Draft PR.
