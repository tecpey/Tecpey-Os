# Academy Account Credential Evidence Inventory

Status: **P0 implementation inventory**  
Issue: **#203**  
Parents: **#161, #100, #156**  
Inventory base: **`2878130bbb9e6c469b3ff0ef89d42b1eda5ac6d0`**  
Owner: **security-platform / academy-identity**

## 1. Active production mutation

`POST /api/academy-auth` currently owns account lookup, password hashing/verification, signup insertion and an implicit `display_name` update during login. The route later delegates session creation to `admitSessionAuthority`, which is already canonical and must remain unchanged.

## 2. Confirmed gaps

- signup account/password state commits without mandatory mutation evidence;
- login mutates display name from request input without an explicit profile command;
- route duplicates credential hashing/verification and SQL;
- a `2fa_required` response emits legacy `writeAudit({ action: "login" })` even though no session has been issued;
- dev JSON storage is non-production fallback and must not be confused with production authority.

## 3. Required authority

Add one server-only Academy credential account authority that:

1. accepts normalized server-derived account ID/email/username/display name and mode;
2. serializes email/username ownership in PostgreSQL;
3. verifies existing passwords without mutation;
4. rejects login for absent accounts;
5. hashes and inserts new signup credentials;
6. appends typed `credential.account.create` evidence in the same transaction;
7. rolls back insertion if evidence fails;
8. returns deterministic `authenticated`, `created`, `invalid_credentials`, `username_taken` or `unavailable` results.

## 4. Privacy contract

Mandatory evidence may contain policy version and domain-separated account/username fingerprints. It must exclude email, password, password hash, display name, raw username, IP, user-agent, token, cookie and request body.

## 5. Route disposition

Production route must delegate account authentication/registration and may not execute account INSERT/UPDATE or own production password verification. Existing login returns the stored profile; it cannot silently update display name. The `2fa_required` branch uses metrics only. Session admission/logout remain delegated to their canonical authorities.

## 6. Local development fallback

Local JSON storage stays explicitly disabled in production. It may reuse the canonical hash/verify helpers but does not represent production durability or evidence.

## 7. Adversarial proof

- account insertion and evidence commit together;
- evidence conflict rolls back insertion;
- existing login creates no credential mutation and preserves profile fields;
- invalid password creates no mutation/evidence;
- concurrent username ownership yields one winner;
- evidence contains no raw credential/profile material;
- source guard rejects route-owned production SQL, legacy audit and request-controlled authority.
