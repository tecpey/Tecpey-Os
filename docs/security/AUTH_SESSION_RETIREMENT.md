# Authentication Session Retirement Authority

Status: **Authoritative security policy**  
Owner: TecPey Security / Identity  
Applies to: unified access sessions, browser session cookies, legacy authentication cookies

## Access-session lifetime

- Unified access JWT expiry and the `tecpey_session` browser-cookie lifetime must be derived from the same canonical configuration.
- The default and absolute maximum access-session lifetime is **4 hours**.
- Deployments may shorten the lifetime, but may not configure less than **5 minutes** or more than **4 hours**.
- Production environment validation must reject malformed or out-of-policy values rather than silently expanding the lifetime.
- Long-lived continuity belongs to PostgreSQL-backed rotating refresh tokens, not access JWTs.

## Legacy-cookie retirement

Legacy Academy, student and user cookies are compatibility-only and are not accepted by strict security operations.

Production rules:

1. Legacy-cookie authentication is disabled by default.
2. Temporary compatibility requires an explicit `TECPEY_LEGACY_AUTH_UNTIL` ISO-8601 cutoff.
3. The configured cutoff may shorten the migration window but may not exceed 30 days from validation time.
4. The immutable hard sunset is **2026-08-18T00:00:00.000Z**.
5. No environment change may extend legacy authentication beyond the hard sunset.
6. After the sunset, the variable must be removed and all clients must use the unified session contract.

## Permanent enforcement

These invariants are retained by:

- `scripts/validate-env.mjs`;
- `scripts/check-auth-session-authority.mjs`;
- focused authentication integration tests;
- pull-request CI and `release:check`.

Any future change that extends access-session lifetime, separates JWT and cookie expiry, or re-enables legacy cookies after the hard sunset requires a new security decision record and explicit CISO approval.
