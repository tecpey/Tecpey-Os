# Phase 39.5 Release Scope Classification

Date: 2026-07-02  
Task ID: TP-0001  
Status: Pending manual QA approval  
Source spec: `docs/engineering/specs/TP-0001_SPEC.md`

## Summary

This document classifies the current visible worktree artifacts for Phase 39.5 as `include`, `defer`, `ignore`, or `manual-review`.

Classification rules:

- `include`: intended to be committed as part of the current documentation/release-scope work.
- `defer`: real project work, but not safe or approved for the current task.
- `ignore`: local-only or generated artifact already excluded from normal git status.
- `manual-review`: requires a human owner decision before commit, move, delete, or ignore.

TP-0001 is documentation-only. It does not decide final ownership of Phase 39 wallet source candidates; that decision belongs to TP-0002.

## Classification Table

| Path | Current status | Classification | Rationale | Next task or owner decision |
|---|---|---|---|---|
| `docs/engineering/specs/TP-0001_SPEC.md` | Untracked | include | Task specification for TP-0001. It is an engineering planning artifact and should be kept with phase specs after review. | Include with TP-0001 documentation commit if approved. |
| `docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md` | New in TP-0001 | include | Required output for TP-0001. It records the current release boundary before implementation work starts. | Include with TP-0001 documentation commit if approved. |
| `src/lib/wallet/address/derivation.ts` | Untracked | defer | Wallet source candidate. Readiness report identifies address derivation correctness risks, including Tron and compressed EVM public key behavior. | TP-0002 wallet ownership decision, then a dedicated address-derivation task. |
| `src/lib/wallet/hsm/aws-cloudhsm.ts` | Untracked | defer | High-risk HSM provider candidate. Readiness report identifies incomplete authenticated transport, request validation, and integration testing. | TP-0002 wallet ownership decision, then split HSM provider tasks. |
| `src/lib/wallet/hsm/index.ts` | Untracked | defer | HSM factory/circuit-breaker candidate. Not wired into tracked runtime code and requires tests before inclusion. | TP-0002 wallet ownership decision, then HSM factory task. |
| `src/lib/wallet/hsm/local-dev.ts` | Untracked | defer | Development-only HSM simulator candidate. Uses deterministic development keys and must remain production-gated. | TP-0002 wallet ownership decision, then dev-only HSM task. |
| `src/lib/wallet/hsm/thales.ts` | Untracked | defer | High-risk Thales HSM provider candidate. Requires vendor validation, authenticated transport, and tests. | TP-0002 wallet ownership decision, then split HSM provider tasks. |
| `src/lib/wallet/hsm/types.ts` | Untracked | defer | HSM type contract candidate. Safer than provider code but still belongs to wallet scope ownership. | TP-0002 wallet ownership decision, then interface contract task. |
| `src/lib/wallet/mpc/index.ts` | Untracked | defer | MPC barrel export candidate. Exposes incomplete MPC APIs if committed prematurely. | TP-0002 wallet ownership decision, then MPC package task. |
| `src/lib/wallet/mpc/orchestrator.ts` | Untracked | defer | MPC orchestrator candidate. Readiness report identifies unimplemented public key retrieval and an unimplemented provider. | TP-0002 wallet ownership decision, then MPC provider-gating task. |
| `src/lib/wallet/mpc/session.ts` | Untracked | defer | MPC session state-machine candidate. Needs fake-provider tests and participant/threshold validation review. | TP-0002 wallet ownership decision, then MPC session task. |
| `src/lib/wallet/mpc/types.ts` | Untracked | defer | MPC type contract candidate. Requires ownership decision and contract tests before commit. | TP-0002 wallet ownership decision, then interface contract task. |
| `src/lib/wallet/multisig/bitcoin.ts` | Untracked | defer | Bitcoin multisig helper candidate. Readiness report identifies missing BIP-67/P2WSH vectors and witness-order risks. | TP-0002 wallet ownership decision, then Bitcoin multisig vector task. |
| `src/lib/wallet/multisig/ethereum.ts` | Untracked | defer | Ethereum Safe helper candidate. Safe compatibility and address validation are not proven by tests. | TP-0002 wallet ownership decision, then Safe EIP-712 task. |
| `src/lib/wallet/multisig/index.ts` | Untracked | defer | Multisig barrel export candidate. Should not expose partial APIs before package acceptance. | TP-0002 wallet ownership decision, then multisig package task. |
| `src/lib/wallet/multisig/policy.ts` | Untracked | defer | Multisig policy candidate. Defaults and amount validation require security/product review. | TP-0002 wallet ownership decision, then policy review task. |
| `src/lib/wallet/multisig/types.ts` | Untracked | defer | Multisig type contract candidate. Requires ownership decision and tests/docs before commit. | TP-0002 wallet ownership decision, then interface contract task. |
| `src/lib/wallet/policy/engine.ts` | Untracked | defer | Wallet policy engine candidate. Readiness report identifies missing `./cache` import and fail-open limit risks. | TP-0002 wallet ownership decision, then cache/engine split tasks. |
| `src/lib/wallet/policy/types.ts` | Untracked | defer | Wallet policy type contract candidate. Should be introduced only with accepted policy package scope. | TP-0002 wallet ownership decision, then interface contract task. |

## Ignored Local Artifacts

The following artifact groups are intentionally ignored by `.gitignore` and do not appear in normal `git status` output:

| Path or pattern | Current status | Classification | Rationale | Next task or owner decision |
|---|---|---|---|---|
| `/.agents/` | Ignored | ignore | Local-only agent skill/config directory. Canonical tracked agent guidance remains under `.claude/skills/`. | No TP-0001 action. |
| `.localized` | Ignored | ignore | macOS Finder localization marker, not project source. | No TP-0001 action. |
| `/Screenshot*.png` | Ignored | ignore | Root-level local screenshots are not project assets unless moved into a named QA record with context. | No TP-0001 action. |
| `/*.mp3` | Ignored | ignore | Root-level local media files are not project source. | No TP-0001 action. |
| `/*.zip` | Ignored | ignore | Root-level archives are local/export artifacts unless explicitly reviewed as release assets. | No TP-0001 action. |

## Explicit Non-Scope For TP-0001

- No source code should be modified.
- No wallet files should be modified, moved, staged, or committed.
- No application logic, tests, package scripts, runtime configuration, or deployment files should be modified.
- No local artifacts should be deleted.

## QA Evidence

Commands required by TP-0001:

- `git status --short --untracked-files=all`
- `git diff -- docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md`
- `git diff -- src`
- `git diff --cached --name-only`

Initial status observed before this document was created:

```text
?? docs/engineering/specs/TP-0001_SPEC.md
?? src/lib/wallet/address/derivation.ts
?? src/lib/wallet/hsm/aws-cloudhsm.ts
?? src/lib/wallet/hsm/index.ts
?? src/lib/wallet/hsm/local-dev.ts
?? src/lib/wallet/hsm/thales.ts
?? src/lib/wallet/hsm/types.ts
?? src/lib/wallet/mpc/index.ts
?? src/lib/wallet/mpc/orchestrator.ts
?? src/lib/wallet/mpc/session.ts
?? src/lib/wallet/mpc/types.ts
?? src/lib/wallet/multisig/bitcoin.ts
?? src/lib/wallet/multisig/ethereum.ts
?? src/lib/wallet/multisig/index.ts
?? src/lib/wallet/multisig/policy.ts
?? src/lib/wallet/multisig/types.ts
?? src/lib/wallet/policy/engine.ts
?? src/lib/wallet/policy/types.ts
```

Manual QA checklist:

- Every visible untracked artifact above is classified.
- Wallet ownership decisions are deferred to TP-0002.
- Ignored local-only artifact classes are documented.
- Rollback is limited to deleting or reverting this document.

## Rollback

If TP-0001 is not approved, remove or revert only this file:

- `docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md`
