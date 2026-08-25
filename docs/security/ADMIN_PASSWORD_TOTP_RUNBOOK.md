# Admin password + TOTP runbook

This is the default TecPey administrator authentication profile for Iran. It
does not require Apple ID, iCloud Keychain, a second device, or QR scanning.

## Required production configuration

- `TECPEY_ADMIN_TOKEN`: one-time bootstrap credential, at least 32 random characters.
- `TECPEY_2FA_SECRET`: distinct secret, at least 32 characters, used to encrypt TOTP material.
- `TECPEY_ADMIN_PASSKEY_ENABLED=false`.
- `TECPEY_CUSTOMER_PASSKEY_ENABLED=false`.

Keep all values in the approved host secret store. Never paste them into source,
logs, browser storage, screenshots, or an administrator provider record.

## First administrator

1. Open `/command-center` on the canonical HTTPS origin.
2. Enter the administrator name, organizational email, a unique passphrase of
   at least 15 characters, its confirmation, and the current bootstrap token.
3. Select **Create Google Authenticator key**.
4. In Google Authenticator select **Enter a setup key**. Use `TecPey Admin` as
   the account name and `Time based` as the key type.
5. Copy the manual key shown by TecPey. QR scanning is not required.
6. Submit the first six-digit code.
7. Store all ten recovery codes offline. Each is single-use and is never shown
   again by the server.
8. Confirm that `/command-center` opens and the session reports password + TOTP.
9. Rotate or seal `TECPEY_ADMIN_TOKEN` according to the break-glass policy.

## Daily login

Use organizational email, administrator password, and the current six-digit
Authenticator code. A recovery code can replace TOTP once if the authenticator
is unavailable. Five failed attempts produce a 15-minute credential lock.

## Security properties

- TOTP follows RFC 6238: six digits, 30-second period, one adjacent window.
- The accepted time step is committed transactionally to prevent code replay.
- TOTP secrets are encrypted with AES-256-GCM at rest.
- Recovery codes are stored only as keyed hashes and removed atomically on use.
- Administrator sessions are database-backed, short-lived, revocable, and
  recorded in the append-only administrator audit chain.
- Passkey ceremonies fail closed unless explicitly enabled for an approved
  market through environment configuration.

## Recovery

- Lost phone, recovery codes available: log in with one recovery code, then use
  the approved credential rotation workflow.
- Lost phone and no recovery codes: use the dual-control break-glass procedure;
  do not reopen public bootstrap or change database credential rows manually.
- Suspected compromise: revoke active sessions, lock the administrator, rotate
  the factor and password, then review the audit chain and provider changes.

## Customer policy for Iran

Verified Limoo mobile OTP is the primary login and registration factor. TOTP is
optional for account hardening and required by policy for selected sensitive
operations. Password-only authentication is not an approved fallback.
