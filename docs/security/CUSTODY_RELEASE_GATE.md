# TecPey Custody Release Gate

## Current readiness: NOT READY for real-money custody

TecPey does **not** currently have an approved production HSM or MPC signer. Real deposit-address allocation, withdrawal approval, signing, broadcast, confirmation/recovery workers, and real-money withdrawal execution must therefore remain disabled in production.

This document is the authoritative release posture for issue #106. The purpose of the current implementation is not to claim custody readiness. Its purpose is to make an unsafe or ambiguous launch impossible.

## Enforced production posture

The central custody authority defaults to `disabled` and is evaluated during environment validation and application boot. In production-like environments:

- any `WALLET_*_PRIVATE_KEY` value is rejected before the application starts;
- simulated custody and development hot-wallet custody are rejected;
- the existing HSM and MPC classes remain explicit non-operational stubs and cannot be selected;
- setting legacy real-withdrawal, worker, or address-allocation flags without approved custody is rejected;
- withdrawal worker modules are not imported while custody is disabled, preventing queue connections and job consumption;
- direct worker startup, queue enqueue, recovery, signing, broadcast, and confirmation entry points independently enforce the same policy;
- admin approval and compliance decisions use the central policy rather than a standalone environment flag;
- new withdrawal requests fail before authorization consumption or fund reservation when custody is unavailable;
- withdrawal APIs expose a sanitized capability status and never expose signer configuration or secret material.

A clean production deployment with `TECPEY_CUSTODY_MODE=disabled` is valid. It supports the non-custodial education/exchange soft-launch surface while truthfully reporting that real withdrawals are unavailable.

## Non-production modes

`simulation` and `dev_hot_wallet` exist only for explicit test/development use. They require an explicit mode, chain allowlist, per-chain USD ceiling, and closed circuit breaker. They are always rejected in production-like environments.

Raw environment private keys are not accepted as production authority. Temporary Buffer zeroing cannot erase an immutable JavaScript string inherited from `process.env`, and the signer cannot independently prove that an upstream hash still represents the approved chain, destination, amount, fee, nonce, tenant, and policy evidence.

## Runtime policy controls

Every active non-production custody mode is governed by:

- an explicit chain allowlist;
- a positive per-chain USD withdrawal ceiling;
- an approval quorum;
- a circuit breaker that defaults open;
- an explicit real-withdrawal flag;
- an explicit worker flag and Redis dependency;
- an explicit address-allocation flag.

The executor rehydrates the authoritative network and `amount_usd` from PostgreSQL and rechecks the policy after claiming the record. Queue payloads cannot grant custody authority.

## Requirements before production custody can be enabled

A future production signer must be implemented and reviewed in a separate change. Readiness requires at minimum:

1. non-exportable HSM/MPC keys and documented key ceremonies;
2. tenant, vault, chain, and key-version separation with rotation and revocation;
3. dual control or quorum approval for sensitive withdrawals;
4. signer-side transaction-intent verification covering tenant, withdrawal ID, chain, destination, amount, asset, fee, nonce, replacement policy, expiry, and approval evidence;
5. immutable signing audit linked to persisted build, broadcast, confirmation, reconciliation, and replacement states;
6. idempotent signing and replay-safe provider request identifiers;
7. provider attestation, restricted network paths, least-privilege identities, and secret-zero bootstrap;
8. backup, regional failure, provider timeout, compromise, reorg, fee-bump, and disaster-recovery runbooks;
9. adversarial cross-tenant, stale-key, changed-intent, duplicate-signing, crash, timeout, and reconciliation tests;
10. a signed production readiness report and explicit executive/security approval.

Until those requirements are implemented and verified, the production policy deliberately has no signer-ready mode.

## Verification commands

```bash
npm run custody:check
npm run test:custody
npm run env:check
npm run release:check
```

The permanent `Custody Release Gate` workflow is read-only and runs on every relevant pull request and `main` change.
