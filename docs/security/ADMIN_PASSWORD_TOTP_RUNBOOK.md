# Admin password + TOTP runbook

This is the default TecPey administrator authentication profile for Iran. It
does not require Apple ID, iCloud Keychain, a second device, or QR scanning.

## Required production configuration

- `TECPEY_ADMIN_TOKEN`: one-time bootstrap credential, at least 32 random characters.
- `TECPEY_ADMIN_SESSION_SECRET`: distinct secret, at least 32 characters, used to sign revocable administrator sessions.
- `TECPEY_2FA_SECRET`: distinct secret, at least 32 characters, used to encrypt TOTP material.
- `TECPEY_ADMIN_PASSKEY_ENABLED=false`.
- `TECPEY_CUSTOMER_PASSKEY_ENABLED=false`.

Keep all values in the approved host secret store, and never reuse a bootstrap,
session, TOTP, or application secret for another purpose. Never paste them into
source, logs, browser storage, screenshots, or an administrator provider record.

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

## Rotate an Authenticator factor

1. Sign in normally and open **Secure Google Authenticator rotation** in the
   Command Center dashboard. Never reopen bootstrap for a routine rotation.
2. Reauthenticate with the current administrator password and either a fresh
   code from the current factor or one recovery code. A supplied recovery code
   is consumed when the rotation challenge starts.
3. Add the newly displayed manual key to Authenticator as a separate `Time based`
   entry. Do not screenshot the key and do not delete the current entry yet.
4. Within ten minutes, submit the first six-digit code from the new entry.
5. Store all ten newly issued recovery codes offline before closing the panel.
   Every prior recovery code becomes invalid when rotation succeeds.
6. Confirm the success state. The server atomically replaces the factor, revokes
   every prior administrator session, and creates a fresh session for the current
   browser. Only then remove the old Authenticator entry.
7. Verify the new factor with a separate private-browser login before ending the
   maintenance window.

If the final response is interrupted, keep both Authenticator entries. Refresh
the page and try a normal login with the new entry first; after access is
restored, repeat rotation to obtain a complete new recovery-code set.

## Security properties

- TOTP follows RFC 6238: six digits, 30-second period, one adjacent window.
- The accepted time step is committed transactionally to prevent code replay.
- TOTP secrets are encrypted with AES-256-GCM at rest.
- Rotation setup uses a ten-minute authenticated, session-bound, encrypted and
  tamper-evident challenge; the new factor is not committed during setup.
- Rotation completion replaces the encrypted factor and all recovery hashes in
  one database transaction, revokes prior sessions, and records audit evidence.
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
