# TecPey Admin Passkey Bootstrap Runbook

Status: **Operational security procedure**

## Purpose

This procedure creates TecPey's first individually attributable administrator and binds that identity to a user-verified discoverable Passkey. The legacy shared administrator token remains a temporary bootstrap/recovery control until the Command Center UI migration is completed and verified.

## Required production configuration

Set all values through the deployment secret manager. Never place production values in Git, browser code, URLs, analytics or logs.

- `TECPEY_ADMIN_TOKEN`: temporary bootstrap secret, at least 24 characters; generate with a cryptographically secure password generator.
- `TECPEY_ADMIN_SESSION_SECRET`: independent session-signing secret, at least 32 random bytes; do not reuse the bootstrap token or any user-session secret.
- `NEXT_PUBLIC_SITE_URL`: canonical HTTPS origin of the TecPey application.
- `WEBAUTHN_RP_ID`: effective registrable domain used by WebAuthn, normally `tecpey.ir` or the exact dedicated admin host.
- `WEBAUTHN_ORIGINS`: comma-separated exact HTTPS origins allowed to complete WebAuthn ceremonies.
- `DATABASE_URL`: production PostgreSQL connection.
- Redis configuration used by `globalThis.tecpeyRedisClient`: mandatory because challenges are single-use and fail closed without Redis.

## First administrator ceremony

1. Confirm PostgreSQL and Redis health.
2. Confirm migrations `0018_admin_control_plane_foundation.sql` and `0019_admin_control_plane_hardening.sql` are applied.
3. Confirm no active, suspended or disabled administrator exists.
4. Call `POST /api/command-center/auth/bootstrap/challenge` from the approved Command Center origin with:
   - `x-tecpey-admin-token`
   - administrator email and display name
5. Use the returned options with `navigator.credentials.create()`.
6. Submit the authenticator response to `POST /api/command-center/auth/bootstrap/verify` with the same temporary bootstrap header.
7. Verify that:
   - the administrator is active;
   - the `super_admin` role is assigned;
   - a Passkey credential exists;
   - a revocable admin session exists;
   - `admin.passkey.registered` and `admin.bootstrap.completed` audit events exist;
   - the response sets the `tecpey_admin_control_session` HttpOnly, Secure, SameSite=Strict cookie.

Bootstrap closes automatically after the first authority becomes active. A second administrator must be invited and approved through the future individual identity-management workflow; bootstrap must not be reopened for routine onboarding.

## Daily Passkey login

1. Request `POST /api/command-center/auth/passkey/challenge`.
2. Call `navigator.credentials.get()` with the returned discoverable-credential options.
3. Submit the assertion to `POST /api/command-center/auth/passkey/verify`.
4. The server atomically consumes the challenge, validates origin/RP ID, requires user presence and user verification, validates the ES256 signature and counter, checks the active administrator identity, creates a server-side revocable session and writes an immutable audit event.

## Logout and revocation

`POST /api/command-center/auth/logout` immediately marks the current server-side session revoked, writes `admin.logout` and clears the control-plane cookie.

Security administrators must later be able to revoke any active administrator session from the session inventory. Changing `permission_version` invalidates prior session tokens for that identity.

## Migration away from the shared token

The shared token must not remain a normal Command Center login mechanism.

Required sequence:

1. Deploy this backend while retaining the legacy path to avoid lockout.
2. Complete and test the Passkey UI for bootstrap and daily login.
3. Verify login, logout, session expiry, revocation and recovery on two independent devices.
4. Change legacy-token authorization so `TECPEY_ADMIN_TOKEN` is accepted only by the bootstrap endpoints while bootstrap is open.
5. Remove the legacy `tecpey_admin_session` cookie path.
6. Rotate `TECPEY_ADMIN_TOKEN` after bootstrap and store it as sealed break-glass material or remove it according to the approved recovery design.
7. Confirm all normal Command Center requests require an individual admin principal and explicit permission.

## Failure and recovery rules

- Redis unavailable: do not issue or verify a challenge.
- Database unavailable: do not activate an administrator or issue a session.
- Missing/weak admin session secret: transaction must roll back; do not create a half-valid session.
- Challenge mismatch, replay, wrong ceremony or wrong origin: deny and require a new ceremony.
- Counter rollback: deny and investigate credential cloning or authenticator-state loss.
- Partially created invited identity: an authorized database recovery procedure may remove or repair it only while no administrator authority is active; record the incident separately.
- Lost only Passkey after shared-token removal: follow the approved dual-control break-glass recovery procedure. Do not silently re-enable the public bootstrap route.

## Evidence gate before production use

- TypeScript, ESLint, browser-persistence guard, all tests and production build pass.
- Bootstrap works once and closes thereafter.
- Discoverable Passkey login works without email/username disclosure.
- Replayed and cross-ceremony challenges fail.
- Revoked sessions fail immediately at the database-backed principal check.
- No raw secret or Passkey material appears in browser storage or logs.
- Audit-chain continuity is verified after registration, login and logout.
