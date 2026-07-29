# Git Workspace Cleanup Plan

Date: 2026-07-02  
Repository root: `/Users/vajihi/Desktop`  
Rule: this was created as a classification plan only. During Sprint 0, approved engineering documents were moved under `docs/engineering/` and clear root-local artifacts were added to `.gitignore`.

## Current Untracked Status Read

```text
?? .agents/
?? .localized
?? ENGINEERING_CONSTITUTION.md
?? "Gin - Vinak.mp3"
?? PHASE39_5_MASTER_PLAN.md
?? PHASE39_5_TASK_BOARD.md
?? PROJECT_AUDIT_PHASE39.md
?? "Screenshot 1405-04-11 at 20.28.59.png"
?? src/lib/wallet/address/derivation.ts
?? src/lib/wallet/hsm/
?? src/lib/wallet/mpc/
?? src/lib/wallet/multisig/
?? src/lib/wallet/policy/
?? tecpey_core_rebuild_phase6_community_career.zip
```

## 1. Must Be Committed

These files are project governance or requested phase records and should be committed intentionally once reviewed.

| File | Why |
|---|---|
| `docs/engineering/governance/ENGINEERING_CONSTITUTION.md` | Permanent TecPey engineering operating standard requested for future work. It belongs in version control as a governance document. |
| `docs/engineering/phase39/PHASE39_5_MASTER_PLAN.md` | Phase 39.5 execution plan requested as an engineering record. It should be committed so future tasks can trace decisions and milestones. |
| `docs/engineering/phase39/PHASE39_5_TASK_BOARD.md` | Atomic task board requested for execution. It should be committed so task IDs, dependencies, and QA requirements are stable. |
| `docs/engineering/phase39/PROJECT_AUDIT_PHASE39.md` | Repository audit requested as the basis for Phase 39.5 planning. It should be committed as a real engineering artifact. |
| `docs/engineering/workspace/GIT_WORKSPACE_CLEANUP_PLAN.md` | This cleanup plan was requested and should be committed as the workspace hygiene record. |

## 2. Should Be Moved Into `docs/`

These are useful engineering records, but may be better organized under documentation rather than the repository root. Move only after manual approval.

| File | Why |
|---|---|
| `docs/engineering/phase39/PROJECT_AUDIT_PHASE39.md` | Audit reports are historical engineering documentation. Root placement was cleaned up during Sprint 0. |
| `docs/engineering/phase39/PHASE39_5_MASTER_PLAN.md` | Phase execution plans are durable planning docs. Root placement was cleaned up during Sprint 0. |
| `docs/engineering/phase39/PHASE39_5_TASK_BOARD.md` | Task boards are phase documentation. Root placement was cleaned up during Sprint 0. |
| `docs/engineering/workspace/GIT_WORKSPACE_CLEANUP_PLAN.md` | Workspace cleanup plans are process documentation. Root placement was cleaned up during Sprint 0. |

## 3. Should Be Added To `.gitignore`

These are local or system artifacts that should not repeatedly appear in `git status`.

| File | Why |
|---|---|
| `.localized` | macOS Finder localization marker. Empty local system artifact, not project source. Add `.localized` to `.gitignore`. |
| `Gin - Vinak.mp3` | Large local media file, unrelated to source, docs, build, or product assets based on filename/location. Add `*.mp3` or this exact file to `.gitignore` if local music/media files recur. |
| `Screenshot 1405-04-11 at 20.28.59.png` | Local screenshot artifact in repo root. Not referenced as a product asset. Add screenshot filename patterns such as `Screenshot*.png` if screenshots recur. |
| `tecpey_core_rebuild_phase6_community_career.zip` | Local archive artifact. Large zip files in repo root should not be tracked unless they are release assets. Add `*.zip` or this exact file to `.gitignore` after confirming no zip artifacts are expected in source control. |
| `.agents/` | Local agent skill/config directory. The repo already tracks `.claude/skills/**`; `.agents/` appears environment-specific and should usually be ignored unless the team intentionally standardizes it. |

## 4. Personal / Local Artifacts

These should not be committed as project source. They should be removed from the working tree or kept outside the repo after manual approval.

| File | Why |
|---|---|
| `Gin - Vinak.mp3` | Personal media file. It is not a web asset under `public/` and has no clear project role. |
| `Screenshot 1405-04-11 at 20.28.59.png` | Personal/local screenshot. If it documents QA, it should be moved to a named docs/QA folder with context; otherwise keep it outside the repo. |
| `.localized` | Local macOS system file, not project-owned. |
| `tecpey_core_rebuild_phase6_community_career.zip` | Local archive bundle. If it contains useful source or QA evidence, extract/review outside the repo and commit only intentional files. |

## 5. Generated Files

No currently untracked paths are clearly generated build output such as `.next/`, `node_modules/`, coverage, or `*.tsbuildinfo`.

Potentially generated or packaged artifact:

| File | Why |
|---|---|
| `tecpey_core_rebuild_phase6_community_career.zip` | This is a packaged archive rather than source. Treat as generated/exported unless manual review proves it is a required release artifact. |

## 6. Temporary Files

These appear temporary or workspace-local and should not be committed without a deliberate reason.

| File | Why |
|---|---|
| `.localized` | Local OS temporary/system marker. |
| `Screenshot 1405-04-11 at 20.28.59.png` | Temporary screenshot unless attached to a formal QA record. |
| `tecpey_core_rebuild_phase6_community_career.zip` | Temporary archive/export unless identified as a required artifact. |

## 7. Unknown: Needs Manual Review

These may be real source work, but they were not part of the tracked repository at status time. They need owner review before commit, ignore, or deletion.

### Agent Skill Files

| File | Why |
|---|---|
| `.agents/skills/engineering/SKILL.md` | Could duplicate tracked `.claude/skills/engineering/SKILL.md` or represent local agent config. Needs owner decision. |
| `.agents/skills/impeccable/SKILL.md` | Could duplicate tracked Claude skill or be local-only agent config. Needs owner decision. |
| `.agents/skills/motion-framer/SKILL.md` | Could duplicate tracked Claude skill or be local-only agent config. Needs owner decision. |
| `.agents/skills/performance/SKILL.md` | Could duplicate tracked Claude skill or be local-only agent config. Needs owner decision. |
| `.agents/skills/qa/SKILL.md` | Could duplicate tracked Claude skill or be local-only agent config. Needs owner decision. |
| `.agents/skills/security/SKILL.md` | Could duplicate tracked Claude skill or be local-only agent config. Needs owner decision. |
| `.agents/skills/tecpey/SKILL.md` | Could contain project-specific agent workflow. Needs review before ignore or commit. |
| `.agents/skills/ui-ux-pro/SKILL.md` | Could duplicate tracked Claude skill or be local-only agent config. Needs owner decision. |

### Wallet / Phase 39 Source Candidates

These files look like real TypeScript source and should not be ignored by default. They should be reviewed against the Phase 39.5 plan and committed only through atomic tasks if accepted.

| File | Why |
|---|---|
| `src/lib/wallet/address/derivation.ts` | Source candidate for wallet address derivation. Must be reviewed for correctness and tests before commit. |
| `src/lib/wallet/hsm/aws-cloudhsm.ts` | Source candidate for AWS CloudHSM integration. High-risk security/wallet code; needs manual review and tests. |
| `src/lib/wallet/hsm/index.ts` | Source candidate for HSM provider selection. High-risk production behavior; needs manual review. |
| `src/lib/wallet/hsm/local-dev.ts` | Source candidate for local HSM simulation. Must be gated from production before commit. |
| `src/lib/wallet/hsm/thales.ts` | Source candidate for Thales HSM integration. High-risk provider code; needs manual review and vendor validation. |
| `src/lib/wallet/hsm/types.ts` | Source candidate defining HSM contracts. Should be committed only with implementation scope and tests. |
| `src/lib/wallet/mpc/index.ts` | Source candidate for MPC exports. Needs review against existing keystore and provider gates. |
| `src/lib/wallet/mpc/orchestrator.ts` | Source candidate for MPC orchestration. Audit noted provider stubs and incomplete public-key retrieval, so it must not be committed as production-ready without gating. |
| `src/lib/wallet/mpc/session.ts` | Source candidate for MPC session management. High-risk signing workflow; needs tests. |
| `src/lib/wallet/mpc/types.ts` | Source candidate for MPC contracts. Needs review with provider implementation plan. |
| `src/lib/wallet/multisig/bitcoin.ts` | Source candidate for Bitcoin multisig. Requires cryptographic correctness review and tests. |
| `src/lib/wallet/multisig/ethereum.ts` | Source candidate for Ethereum multisig. Requires signing/address correctness review and tests. |
| `src/lib/wallet/multisig/index.ts` | Source candidate for multisig exports. Commit only with the accepted multisig task scope. |
| `src/lib/wallet/multisig/policy.ts` | Source candidate for multisig policy. High-risk authorization behavior; needs manual review. |
| `src/lib/wallet/multisig/types.ts` | Source candidate defining multisig contracts. Needs review with implementation scope. |
| `src/lib/wallet/policy/engine.ts` | Source candidate for wallet policy engine. High-risk withdrawal/security behavior; needs tests. |
| `src/lib/wallet/policy/types.ts` | Source candidate defining wallet policy contracts. Needs review with policy engine task. |

## Recommended Cleanup Order

1. Commit or move the requested engineering documents after review.
2. Decide whether `.agents/` is team-owned or local-only.
3. Decide Phase 39 wallet source scope file-by-file.
4. Add `.localized`, screenshots, media, zip archives, and local agent folders to `.gitignore` only after owner approval.
5. Move personal/local artifacts out of the repo or leave them untracked until explicitly handled.

## Sprint 0 Notes

- Engineering documentation was moved into `docs/engineering/`.
- No source files were modified.
- No files were deleted or committed.
