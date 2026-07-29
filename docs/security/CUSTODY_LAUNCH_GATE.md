# TecPey Production Custody Launch Gate

**Status:** enforced — production custody disabled  
**Authority:** `src/lib/wallet/custody-launch-policy.ts`  
**Tracked blocker:** #106

## Current release stance

TecPey must not derive deposit addresses, approve real withdrawals, start withdrawal execution workers, sign transactions, or broadcast transactions in production until an approved non-exportable signer and its operational controls have been independently verified.

The application may boot in production only in **custody-disabled mode**. This permits non-custodial product areas to operate without silently activating wallet infrastructure.

## Production-denied configurations

Production startup and release validation reject:

- `TECPEY_REAL_WITHDRAWALS_ENABLED=1`;
- every populated `WALLET_*_PRIVATE_KEY` or indexed `WALLET_*_PRIVATE_KEY_*` variable;
- simulated custody activation;
- HSM or MPC variables while those providers remain unimplemented;
- invalid custody chain allowlist entries.

Error messages must never include private-key values or secret-bearing environment variable names.

## Enforced capability boundaries

The shared policy is checked at all irreversible boundaries:

1. application bootstrap;
2. withdrawal worker startup;
3. withdrawal execution before the PostgreSQL claim/state transition;
4. deposit address derivation;
5. transaction signing and public-key derivation;
6. transaction broadcast;
7. admin withdrawal approval.

A disabled or misconfigured runtime fails before claiming an approved withdrawal, preventing a false `building_transaction`, `signing`, or `broadcasting` state.

## Operational controls

- `TECPEY_CUSTODY_KILL_SWITCH=1` disables custody capabilities immediately.
- `TECPEY_CUSTODY_ENABLED_CHAINS` is a comma-separated allowlist of:
  `bitcoin,ethereum,bsc,polygon,tron,solana`.
- The safe status endpoint is `GET /api/wallet/custody-status`.
- The endpoint exposes availability and enabled chains only. It never exposes signer identifiers, key names, endpoints, or secret values.

## Requirements before production enablement

The launch gate must remain closed until all of the following exist and pass independent review:

- implemented HSM or MPC provider using non-exportable keys;
- dual-control provisioning and rotation ceremony;
- per-chain key separation and explicit chain enablement;
- transaction policy limits and approval thresholds;
- signer authentication, replay protection, request integrity, and tamper-evident audit evidence;
- tested kill switch, circuit breaker, degraded mode, retry, and reconciliation behavior;
- backup, recovery, disaster-recovery, and key-compromise runbooks;
- production-like signing and broadcast drills with no environment private keys;
- security review proving private-key material cannot enter application memory, logs, artifacts, or telemetry.

## Verification

Permanent checks:

```bash
npm run custody:check
npm run test:custody-gate
npm run env:check
```

These checks are included in `release:check`. Any future change that bypasses the gate must fail CI before merge.
