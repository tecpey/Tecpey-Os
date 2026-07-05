# TP-0001 Spec: Classify Current Release Scope

Date: 2026-07-02  
Task ID: TP-0001  
Source: `docs/engineering/phase39/PHASE39_5_TASK_BOARD.md`  
Category: Release Management  
Priority: P0  
Estimated effort: 3 hours  
Planned commit: `docs: classify phase 39.5 release scope`

## 1. Task Summary

Create a release-scope classification document for Phase 39.5. The document must classify current worktree artifacts as `include`, `defer`, `ignore`, or `manual-review` so engineering can start from a controlled repository state.

## 2. Business Objective

Reduce release ambiguity before security, runtime, wallet, and QA work begins. A clear scope boundary prevents accidental inclusion of local artifacts, incomplete wallet source, generated files, or unrelated user files in production work.

## 3. Technical Objective

Produce a documentation-only release-scope record that maps current untracked and modified files to an approved action category. The task must not modify application logic, wallet source, build configuration, runtime behavior, or feature code.

## 4. Scope

- Read current git status.
- Review current untracked artifacts and modified files.
- Classify each visible worktree artifact as:
  - `include`
  - `defer`
  - `ignore`
  - `manual-review`
- Create or update the release-scope document.
- Confirm no source files changed.
- Provide QA evidence in the document or final task summary.

Recommended release-scope document path:

- `docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md`

## 5. Out Of Scope

- Implementing Sprint 1 or later tasks.
- Editing source code under `src/`.
- Editing wallet files under `src/lib/wallet/`.
- Moving, deleting, or staging wallet source candidates.
- Changing application logic, auth, routes, runtime config, build scripts, or dependencies.
- Deciding final ownership of Phase 39 wallet source files; that belongs to TP-0002.
- Removing local artifacts from disk.
- Committing without review.

## 6. Files To Modify

- `docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md`

No other file should be required for TP-0001.

## 7. Files NOT To Modify

- `src/**`
- `src/lib/wallet/**`
- `package.json`
- `package-lock.json`
- `.env*`
- `Dockerfile`
- `server.ts`
- `next.config.ts`
- deployment files
- existing tracked source, test, route, worker, or library files

## 8. Dependencies

- No task dependencies.
- Must read:
  - `docs/engineering/phase39/PHASE39_5_TASK_BOARD.md`
  - `docs/engineering/phase39/PHASE39_5_MASTER_PLAN.md`
  - `docs/engineering/workspace/GIT_WORKSPACE_CLEANUP_PLAN.md`
  - `docs/engineering/wallet/WALLET_PHASE39_READINESS_REPORT.md`

## 9. Security Considerations

- Do not inspect or print secret values from `.env`, `.env.local`, `.env.production`, or similar files.
- Do not commit local files that may contain secrets or sensitive screenshots.
- Treat wallet, auth, admin, KYC, withdrawal, trading, and API-key files as high-risk by default.
- Classify incomplete wallet/HSM/MPC files as `defer` or `manual-review`, not `include`, unless a later approved task explicitly changes that decision.

## 10. Performance Considerations

- No runtime or application performance impact is expected because this is documentation-only.
- Avoid running build, lint, typecheck, or tests for this task unless specifically requested, because TP-0001 only classifies release scope and should not create generated artifacts.

## 11. Implementation Steps

1. Run `git status --short --untracked-files=all`.
2. Read the existing engineering cleanup and wallet readiness reports.
3. Create `docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md`.
4. Add a classification table with columns:
   - path
   - current status
   - classification
   - rationale
   - next task or owner decision
5. Classify engineering docs as `include` if already committed and relevant.
6. Classify clear local artifacts as `ignore`.
7. Classify wallet source candidates as `defer` or `manual-review`.
8. Classify unknown agent or local tooling files according to the current `.gitignore` state and governance docs.
9. Add a QA evidence section with the status command used.
10. Run `git diff -- docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md`.
11. Run `git status --short --untracked-files=all`.
12. Confirm no files under `src/` were modified or staged.

## 12. Acceptance Criteria

- `docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md` exists.
- Every visible untracked or modified worktree artifact is classified.
- Classifications use only `include`, `defer`, `ignore`, or `manual-review`.
- No source code is modified.
- No wallet files are modified.
- Git status is captured after the document is created.
- Rollback is possible by reverting or deleting only the release-scope document.

## 13. QA Checklist

- Run `git status --short --untracked-files=all`.
- Verify no tracked source files changed.
- Verify no wallet files changed.
- Verify the release-scope table covers all visible untracked source candidates.
- Verify local-only ignored artifacts do not appear in normal git status.
- Verify the document names TP-0002 as the task for wallet ownership decisions.

## 14. Test Plan

Automated tests are not required for TP-0001 because the task is documentation-only.

Manual validation:

- Review the release-scope document against `git status`.
- Confirm every visible path is represented or intentionally grouped.
- Confirm no source diff exists with `git diff -- src`.
- Confirm no staged source exists with `git diff --cached --name-only`.

## 15. Rollback Plan

Rollback method:

- Revert the commit that adds `docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md`.

If not yet committed:

- Remove `docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md` from the worktree.

Rollback risk:

- Low. The task is documentation-only and should not affect runtime behavior.

## 16. Git Commit Strategy

- Commit exactly one logical documentation change.
- Recommended commit name:
  - `docs: classify phase 39.5 release scope`
- Include only:
  - `docs/engineering/phase39/PHASE39_5_RELEASE_SCOPE.md`
- Do not include:
  - source files
  - wallet files
  - local artifacts
  - generated files
  - unrelated documentation edits
