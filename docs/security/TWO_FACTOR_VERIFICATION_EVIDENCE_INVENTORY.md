# Two-Factor Verification and Pre-Auth Evidence Inventory

Status: **P0 implementation inventory**  
Issue: **#201**  
Parents: **#161, #100, #156**  
Inventory base: **`cbfe823a6831314352d9e7fecceb640b34e8f036`**  
Owner: **security-platform / authentication**

## 1. Bounded objective

This slice makes active TOTP verification and password+2FA login completion transactionally evidenced and replay-safe. It does not redesign enrollment, enablement, disablement, backup-code consumption, recovery or passkeys.

## 2. Active route authority

`POST /api/auth/2fa/verify` currently supports two flows:

- strict-session step-up verification;
- password pre-auth completion that later delegates session registry/evidence to `admitSessionAuthority`.

The route currently owns credential SQL, secret decryption, TOTP verification, `last_used_at`, best-effort `writeAudit()` calls and pre-auth token consumption. This creates competing authority beside `two-factor-authority.ts` and `session-authority.ts`.

## 3. Confirmed defects

### 3.1 Verification evidence split

- invalid and successful verification use detached `writeAudit()`;
- successful verification updates `last_used_at` separately;
- PostgreSQL failure can leave credential usage and mandatory evidence inconsistent;
- route code can accidentally diverge from lifecycle credential rules.

### 3.2 Pre-auth token destroyed before proof

`consumePreAuthToken()` performs Redis `GET` and `DEL` before the submitted TOTP is verified. A mistyped code, database outage or credential corruption permanently consumes the login challenge.

### 3.3 Concurrent session completion

The current pre-auth lookup/consume operation does not separate principal discovery from one-time ownership. The correct contract is peek for principal discovery, then atomic claim only after verified TOTP; only the claimant may call `admitSessionAuthority`.

### 3.4 Privacy boundary

Raw TOTP, encrypted secret, pre-auth token, IP and user-agent must not enter mandatory evidence. Session authority may continue using its existing bounded server context.

## 4. Existing authority to preserve

- `two-factor-authority.ts` already transactionally owns enroll, enable, disable and backup-code mutations;
- `sensitive_mutation_audit_events` is append-only and correlation-bound;
- `admitSessionAuthority` remains the sole session registry and session evidence owner;
- cookies are written only after session admission succeeds;
- strict session revocation remains required for non-preauth step-up verification.

## 5. Required verification authority

Add `verifyTwoFactorCredential()` to the existing 2FA authority. In one PostgreSQL transaction it must:

1. bind audit actor to the server-resolved principal;
2. lock the `user_2fa` row;
3. require an enabled credential;
4. decrypt and verify the submitted code;
5. append `credential.2fa.verify` rejected evidence on invalid code;
6. update `last_used_at` and append success evidence atomically;
7. fail closed when database/evidence authority is unavailable.

Safe metadata is limited to policy version, result category and a domain-separated accepted-step fingerprint when needed. No submitted credential material is permitted.

## 6. Required pre-auth lifecycle

- `peekPreAuthToken(token)` resolves the server principal without consuming the challenge;
- invalid TOTP leaves the challenge available for another bounded attempt;
- `claimPreAuthToken(token)` atomically removes and returns the principal after verified TOTP;
- a missing, ambiguous or mismatched claim prevents session admission;
- only the successful claimant may call `admitSessionAuthority`;
- Redis absence/error is fail-closed and cannot mint cookies or sessions.

## 7. Route disposition

The route must retain only:

- CSRF, bounded body and rate limit controls;
- strict session/pre-auth principal resolution;
- correlation/request evidence construction;
- delegation to verification authority;
- metrics and HTTP mapping;
- pre-auth claim, account lookup, token preparation and canonical session admission;
- cookie writing after admission.

It must not import credential decryption/verification, execute `user_2fa` SQL or call `writeAudit()`.

## 8. Verification evidence contract

Typed action: `credential.2fa.verify`  
Resource: `credential_2fa`

Outcomes:

- `success` — verified credential and committed `last_used_at`;
- `rejected` — invalid submitted code;
- corruption/not-enabled remain truthful route errors and must not expose credential details.

Mandatory evidence excludes code, raw/encrypted secret, token, cookie, IP, user-agent, request body, email and unrestricted metadata.

## 9. Adversarial proof

- success couples `last_used_at` and evidence;
- invalid code writes rejected evidence without changing usage state;
- forced evidence conflict rolls back success state;
- one pre-auth token has one successful claimant under concurrency;
- invalid code does not consume the challenge;
- Redis outage/ambiguity cannot issue a session;
- claimed-principal mismatch fails closed;
- source guard rejects route-side credential SQL/decryption/`writeAudit()`;
- session issuance remains delegated to `admitSessionAuthority`.

## 10. Non-goals

This slice does not implement recovery codes UI, account recovery, lockout policy redesign, passkey changes, email/SMS OTP, new session token formats or notification delivery.
