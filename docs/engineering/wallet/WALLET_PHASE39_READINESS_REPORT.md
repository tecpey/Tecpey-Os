# Wallet Phase 39 Readiness Report

Date: 2026-07-02

Scope:

- `src/lib/wallet/address/`
- `src/lib/wallet/hsm/`
- `src/lib/wallet/mpc/`
- `src/lib/wallet/multisig/`
- `src/lib/wallet/policy/`

Rules applied:

- No source code was modified.
- This report focuses on readiness of the specified wallet source paths.
- Git status shows the new Phase 39 wallet source paths are untracked, except `src/lib/wallet/address/validator.ts`, which is already tracked and referenced by existing provider/test code.

## Executive Summary

The Phase 39 wallet modules are mostly architecture scaffolding and partial implementations. They are not production-ready as a set and should not be committed as one large source drop.

The safest path is to split the work into smaller commits:

1. Commit pure types and interface contracts with compile checks.
2. Commit deterministic development-only adapters behind explicit non-production guards.
3. Fix address derivation correctness before any HSM/MPC address use.
4. Add missing wallet policy cache implementation before committing `policy/engine.ts`.
5. Add reference-vector tests before any multisig, HSM, MPC, or address-derivation code is considered production-capable.

Highest-risk blockers:

- `src/lib/wallet/policy/engine.ts` imports `./cache`, but no matching `cache.ts` exists in the scoped files. This is a build blocker if the module is committed without the missing dependency.
- `src/lib/wallet/address/derivation.ts` derives Tron as an EVM `0x...` address and hashes compressed EVM public keys directly. Both can produce wrong wallet addresses.
- HSM providers call HTTP proxy endpoints without visible request authentication, mTLS enforcement, request signing, replay protection, or strong response validation.
- MPC is not implemented: public key retrieval throws and the default provider intentionally throws.
- Multisig modules are partial helpers, not transaction execution paths. They need reference vectors and integration boundaries before use with funds.

## Reference Summary

- `src/lib/wallet/address/validator.ts` is referenced by:
  - `src/lib/wallet/providers/ethereum.ts`
  - `src/tests/wallet/address-validation.test.ts`
- `src/lib/wallet/address/derivation.ts` is referenced only by untracked HSM/MPC modules.
- `src/lib/wallet/hsm/*` is not referenced by tracked source outside the HSM package.
- `src/lib/wallet/mpc/*` is not referenced by tracked source outside the MPC package.
- `src/lib/wallet/multisig/*` is not referenced by tracked source outside the multisig package.
- `src/lib/wallet/policy/*` is not referenced by tracked source outside the policy package.

## File Readiness

### `src/lib/wallet/address/derivation.ts`

- Production-ready: No.
- Complete: No.
- Referenced anywhere: Only by untracked HSM/MPC files.
- Dead code: Not exactly; it is intended support code for Phase 39, but currently not wired into tracked runtime paths.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: No, not without fixes and tests.
- Missing tests: Ethereum/BSC/Polygon address vectors, compressed vs uncompressed secp256k1 keys, Tron base58check vectors, Bitcoin P2WPKH mainnet/testnet vectors, Solana vectors, invalid key lengths, malformed public key inputs, validator cross-checks.
- Security risks: Incorrect derivation can route deposits/withdrawals to unusable or wrong addresses. Tron is derived as an EVM `0x...` address. Compressed EVM keys are hashed directly instead of decompressed first. Public key validation is weak.
- Recommendation: Split into a dedicated address-derivation task. Commit later after correctness fixes and vector tests.

### `src/lib/wallet/address/validator.ts`

- Production-ready: Partially; suitable as an existing validation helper, but still needs broader coverage.
- Complete: Mostly for the currently supported address formats, but not exhaustively validated.
- Referenced anywhere: Yes, by tracked Ethereum provider code and address validation tests.
- Dead code: No.
- Experimental: No; this appears to be an existing Phase 38 utility.
- Part of Phase 39: No, except it should be used to validate Phase 39 derived addresses.
- Safe to commit: Already tracked. No new commit action needed for this report.
- Missing tests: More checksum failure cases, Bitcoin P2WSH/P2TR handling decisions, mixed-case EIP-55 cases, Tron checksum vectors, Solana edge-length cases, dependency-failure behavior for keccak.
- Security risks: `keccak256()` falls back to a zero buffer if dynamic import fails, which may hide dependency/runtime failures and produce misleading checksum behavior.
- Recommendation: Keep. Improve later with more test vectors and fail-closed checksum behavior.

### `src/lib/wallet/hsm/types.ts`

- Production-ready: No as a feature, but acceptable as an interface draft.
- Complete: Incomplete; lacks detailed constraints for signature encoding, audit metadata, algorithm restrictions, and key lifecycle.
- Referenced anywhere: Only by untracked HSM implementation files.
- Dead code: No, if HSM integration proceeds.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later as part of a small interface-only task with type checks.
- Missing tests: Type-level contract tests, signature format expectations, supported chain/key matrix validation.
- Security risks: Ambiguous interfaces can lead to inconsistent providers and unsafe assumptions about signature encodings and key ownership.
- Recommendation: Commit later, preferably before provider implementations, with documentation and compile validation.

### `src/lib/wallet/hsm/index.ts`

- Production-ready: No.
- Complete: No.
- Referenced anywhere: Not by tracked runtime code; only internally exports/wraps HSM providers.
- Dead code: Currently unused scaffolding.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later after tests and explicit integration decisions.
- Missing tests: Provider selection, production local-dev blocking, singleton reset behavior, circuit breaker open/half-open/closed transitions, failure recovery, health check behavior.
- Security risks: Factory could create a provider based only on environment variables. Circuit breaker wraps `sign()` only, not key discovery or public key retrieval. No readiness/audit enforcement before signing.
- Recommendation: Split into factory/circuit-breaker task and provider wiring task.

### `src/lib/wallet/hsm/local-dev.ts`

- Production-ready: No.
- Complete: Mostly complete as a development simulator, not as production code.
- Referenced anywhere: Only by untracked `hsm/index.ts`.
- Dead code: Currently unused by tracked runtime code.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later only if clearly documented and test-gated as non-production.
- Missing tests: Production guard coverage for every method, deterministic signature/address vectors, no private-key logging, address derivation consistency, Ed25519 behavior.
- Security risks: Uses deterministic fixed private seeds. `healthCheck()` does not enforce the production guard if directly instantiated. Any accidental production enablement would be catastrophic.
- Recommendation: Commit later as test/dev support, separately from production HSM providers.

### `src/lib/wallet/hsm/aws-cloudhsm.ts`

- Production-ready: No.
- Complete: No.
- Referenced anywhere: Only by untracked `hsm/index.ts`.
- Dead code: Currently unused by tracked runtime code.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: No as production code; commit later as a stub only if clearly marked and excluded from production use.
- Missing tests: Mocked proxy integration tests, request authentication tests, timeout/retry tests, invalid response tests, signature encoding tests, key lookup tests, audit logging tests, no-secret logging checks.
- Security risks: HTTP proxy calls lack visible authentication, mTLS enforcement, request signing, replay protection, nonce/idempotency, response validation, and audit guarantees. HSM PIN is read from env but not visibly used in requests.
- Recommendation: Split into configuration validation, authenticated transport, key discovery, signing, and integration test tasks.

### `src/lib/wallet/hsm/thales.ts`

- Production-ready: No.
- Complete: No.
- Referenced anywhere: Only by untracked `hsm/index.ts`.
- Dead code: Currently unused by tracked runtime code.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: No as production code; commit later as a stub only if clearly marked and excluded from production use.
- Missing tests: Mock Thales proxy tests, partition/key lookup tests, auth/TLS tests, response validation tests, EDDSA/ECDSA signature format tests, failure logging tests.
- Security risks: Proxy calls lack visible authentication, mTLS enforcement, replay protection, request signing, and response validation. PIN is configured but not visibly used. `listKeys()` assumes secp256k1 for all returned objects.
- Recommendation: Split into transport/auth, key inventory, signing, and tests.

### `src/lib/wallet/mpc/types.ts`

- Production-ready: No as a feature, but acceptable as an interface draft.
- Complete: Incomplete; lacks provider trust model, participant auth semantics, threshold validation rules, and final signature encoding guarantees.
- Referenced anywhere: Only by untracked MPC implementation files.
- Dead code: No, if MPC integration proceeds.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later as an interface-only task with tests/docs.
- Missing tests: Type/contract tests for session state transitions, scheme support, participant identifiers, and signature representation.
- Security risks: Ambiguous threshold and participant semantics can lead to unsafe provider adapters.
- Recommendation: Commit later as a small contract commit.

### `src/lib/wallet/mpc/session.ts`

- Production-ready: No.
- Complete: No.
- Referenced anywhere: Only by untracked `mpc/orchestrator.ts`.
- Dead code: Currently unused by tracked runtime code.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later after fake-provider tests and cancellation controls.
- Missing tests: Completed session, failed session, expired session, timeout cancellation, combine failure, missing session, poll interval behavior, participant threshold behavior.
- Security risks: No abort signal, no participant authentication, no explicit threshold verification, and no durable audit trail. It trusts provider state fully.
- Recommendation: Split into state-machine task with a deterministic fake provider test suite.

### `src/lib/wallet/mpc/orchestrator.ts`

- Production-ready: No.
- Complete: No.
- Referenced anywhere: Only by untracked `mpc/index.ts`.
- Dead code: Currently unused by tracked runtime code.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: No in its current state unless committed as disabled scaffolding.
- Missing tests: Configuration validation, unconfigured behavior, unsupported provider behavior, signing failure paths, public key retrieval path once implemented, address derivation integration.
- Security risks: `getKeyHandle()` throws, so address generation cannot work. `createMpcKeyStore()` returns an unimplemented provider that will fail signing. There is no real MPC SDK adapter or participant trust enforcement.
- Recommendation: Split. Commit contracts/session first; commit orchestrator only after a real provider adapter or explicit disabled feature gate.

### `src/lib/wallet/mpc/index.ts`

- Production-ready: No.
- Complete: Minimal barrel export only.
- Referenced anywhere: Not by tracked runtime code.
- Dead code: Currently unused.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later only with the MPC package it exports.
- Missing tests: Export surface/import smoke test.
- Security risks: Low by itself; risk comes from exposing incomplete MPC APIs as available.
- Recommendation: Commit later with MPC contracts after feature gating.

### `src/lib/wallet/multisig/types.ts`

- Production-ready: No as a feature, but acceptable as an interface draft.
- Complete: Incomplete; needs chain-specific execution and signature semantics.
- Referenced anywhere: Only by untracked multisig files.
- Dead code: No, if multisig proceeds.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later as part of an interface-only or multisig-foundation task.
- Missing tests: Type/import smoke tests and validation of allowed schemes.
- Security risks: Low by itself; ambiguity in types can cause unsafe signing/execution assumptions.
- Recommendation: Commit later with docs and tests.

### `src/lib/wallet/multisig/policy.ts`

- Production-ready: No.
- Complete: Complete only as a simple threshold resolver.
- Referenced anywhere: Only by untracked `multisig/index.ts`.
- Dead code: Currently unused by tracked runtime code.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later after policy review.
- Missing tests: Boundary values at 10,000 and 100,000 USD, chain-specific override tests, negative/NaN amount handling, Infinity behavior, fallback behavior.
- Security risks: Default `1-of-1` up to 10,000 USD may be too permissive. There is no validation for negative, NaN, or nonsensical amounts.
- Recommendation: Commit later after treasury/security policy review.

### `src/lib/wallet/multisig/bitcoin.ts`

- Production-ready: No.
- Complete: Partial helper only.
- Referenced anywhere: Only by untracked `multisig/index.ts`.
- Dead code: Currently unused by tracked runtime code.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later after reference-vector tests.
- Missing tests: BIP-67 sorting vectors, P2WSH address vectors, witness stack vectors, invalid public keys, threshold failures, signature ordering by sorted public key, testnet/mainnet vectors.
- Security risks: Witness construction uses collected signature order and does not verify signatures are aligned to sorted public keys. There is no PSBT/sighash/fee/change handling. Wrong witness order can invalidate transactions.
- Recommendation: Split into script/address helper task and transaction signing/execution task.

### `src/lib/wallet/multisig/ethereum.ts`

- Production-ready: No.
- Complete: Partial Safe-compatible EIP-712 helper only.
- Referenced anywhere: Only by untracked `multisig/index.ts`.
- Dead code: Currently unused by tracked runtime code.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later after Safe reference-vector tests.
- Missing tests: Safe domain separator vectors, SafeTx hash vectors, signature sorting vectors, invalid address handling, signature byte layout validation, chain ID tests.
- Security risks: Address helper pads stripped strings without validating exact EVM address format. Signature byte layout and Safe compatibility need verification against Safe contracts. No on-chain execution or nonce validation.
- Recommendation: Split into EIP-712 hashing task, signature encoding task, and Safe execution integration task.

### `src/lib/wallet/multisig/index.ts`

- Production-ready: No.
- Complete: Minimal barrel export only.
- Referenced anywhere: Not by tracked runtime code.
- Dead code: Currently unused.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later only with the multisig package it exports.
- Missing tests: Export surface/import smoke test.
- Security risks: Low by itself; risk is exposing partial multisig helpers as production-ready APIs.
- Recommendation: Commit later with tested multisig foundation.

### `src/lib/wallet/policy/types.ts`

- Production-ready: No as a feature, but acceptable as a type contract.
- Complete: Incomplete; needs cache/store and operational policy semantics.
- Referenced anywhere: Only by untracked `policy/engine.ts`.
- Dead code: No, if policy engine proceeds.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: Commit later with policy engine/cache implementation.
- Missing tests: Type/import smoke tests and policy object validation tests.
- Security risks: Low by itself; missing validation semantics may lead to unsafe defaults in engine code.
- Recommendation: Commit later with the policy package after cache is added.

### `src/lib/wallet/policy/engine.ts`

- Production-ready: No.
- Complete: No.
- Referenced anywhere: Not by tracked runtime code.
- Dead code: Currently unused and build-unsafe without the missing cache module.
- Experimental: Yes.
- Part of Phase 39: Yes.
- Safe to commit: No.
- Missing tests: Missing cache implementation tests, mode handling, single/hourly/daily limits, no-cache fail behavior, operator allowlist, null operator behavior, negative/zero/NaN amount handling, boundary approval thresholds, record spend behavior.
- Security risks: Imports missing `./cache`. If cache is absent at runtime, rolling limits are effectively skipped. Defaults allow high single/daily/hourly withdrawals. Operator allowlist is bypassed when `operatorId` is null. Amount validation is missing.
- Recommendation: Split into cache implementation, policy engine validation, policy defaults review, and tests. Commit later only after build passes.

## Suggested Commit Decisions

Commit now:

- None of the untracked source paths should be committed immediately as production code.

Commit later:

- `hsm/types.ts`, `mpc/types.ts`, `multisig/types.ts`, `policy/types.ts` as small contract commits with compile tests.
- `hsm/local-dev.ts` only as non-production test/dev infrastructure with explicit guard tests.
- Barrel exports only when their package is intentionally introduced and covered by smoke tests.

Delete:

- No file should be deleted solely from this review. Several files are valid scaffolding, but they are not ready to merge as production functionality.

Move:

- If the team wants to preserve incomplete provider sketches, consider moving HSM/MPC production-provider drafts into a clearly marked experimental or docs-backed implementation task. Do not move source files in this report.

Split into smaller tasks:

- Address derivation correctness.
- HSM interfaces.
- HSM local development provider.
- HSM authenticated transport per vendor.
- MPC interface contracts.
- MPC session state machine.
- MPC provider adapter.
- Multisig Bitcoin scripts and vectors.
- Multisig Safe EIP-712 vectors.
- Wallet policy cache.
- Wallet policy engine and limits.

## Final Readiness Table

| File | Ready | Risk | Action |
|---|---:|---|---|
| `src/lib/wallet/address/derivation.ts` | No | Critical: wrong address derivation can lose funds | Split into smaller tasks; commit later |
| `src/lib/wallet/address/validator.ts` | Partial | Medium: checksum fallback and limited vectors | Keep tracked; improve later |
| `src/lib/wallet/hsm/types.ts` | No | Medium: ambiguous provider contract | Commit later as contract task |
| `src/lib/wallet/hsm/index.ts` | No | High: incomplete factory/circuit-breaker behavior | Split; commit later |
| `src/lib/wallet/hsm/local-dev.ts` | No | High: deterministic dev keys must never reach prod | Commit later as dev-only task |
| `src/lib/wallet/hsm/aws-cloudhsm.ts` | No | Critical: unauthenticated/incomplete signing transport | Split; commit later |
| `src/lib/wallet/hsm/thales.ts` | No | Critical: unauthenticated/incomplete signing transport | Split; commit later |
| `src/lib/wallet/mpc/types.ts` | No | Medium: incomplete trust/threshold contract | Commit later as contract task |
| `src/lib/wallet/mpc/session.ts` | No | High: untested orchestration and provider trust | Split; commit later |
| `src/lib/wallet/mpc/orchestrator.ts` | No | Critical: public key path and provider are unimplemented | Split; commit later |
| `src/lib/wallet/mpc/index.ts` | No | Low: exposes incomplete APIs | Commit later with MPC package |
| `src/lib/wallet/multisig/types.ts` | No | Medium: incomplete execution semantics | Commit later as contract task |
| `src/lib/wallet/multisig/policy.ts` | No | High: permissive defaults and weak amount validation | Commit later after policy review |
| `src/lib/wallet/multisig/bitcoin.ts` | No | High: partial witness logic and missing vectors | Split; commit later |
| `src/lib/wallet/multisig/ethereum.ts` | No | High: Safe compatibility not proven | Split; commit later |
| `src/lib/wallet/multisig/index.ts` | No | Low: exposes incomplete APIs | Commit later with multisig package |
| `src/lib/wallet/policy/types.ts` | No | Medium: incomplete policy contract | Commit later with policy package |
| `src/lib/wallet/policy/engine.ts` | No | Critical: missing cache import and fail-open limits | Split; commit later |
