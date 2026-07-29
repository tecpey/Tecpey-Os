# TecPey Engineering Constitution

Date: 2026-07-02  
Status: **SUPERSEDED** — See `docs/TECPEY_CONSTITUTION.md` (Phase 39.5)  
Reason: Superseded by `TECPEY_CONSTITUTION.md` which expands from engineering-only to full-platform governance, AI agent rules, Git/commit standards, QA gates, security, release management, and amendment procedures.  
This document is retained for historical reference. Do not use as current source of truth.

## 1. Purpose

This constitution defines the engineering rules for building, auditing, modifying, reviewing, and releasing the TecPey platform.

TecPey handles education, identity, security, trading, wallets, and financial-risk workflows. Engineering work must therefore be small, auditable, reversible, tested, and explicit. Speed is valuable only when it does not compromise safety, user trust, or production reliability.

## 2. Permanent Engineering Rules For TecPey

- Every future task must be atomic.
- One task equals one logical change.
- Every task must be independently mergeable.
- Every task must have QA evidence.
- Every task must be rollbackable.
- No large multi-feature commits.
- No source code change may be made without a clear task, acceptance criteria, validation plan, and rollback method.
- No production-facing feature is production-ready without automated tests or documented manual QA evidence.
- Financial, wallet, auth, admin, KYC, trading, and withdrawal changes are high-risk by default.
- Development fallbacks must never silently become production behavior.
- Generated files, local artifacts, and user files must not be committed unless explicitly approved.
- Existing user changes must not be reverted without explicit permission.
- If implementation scope expands, split the work into new atomic tasks before proceeding.

## 3. AI Agent Rules

- AI agents must read the relevant plan, task board, and source files before proposing or editing code.
- AI agents must not modify source code when the user asks for planning, review, or documentation only.
- AI agents must state which files they intend to edit before editing.
- AI agents must use small patches and avoid unrelated refactors.
- AI agents must not invent production readiness; they must distinguish implemented, stubbed, gated, and documented behavior.
- AI agents must not inspect or expose secrets.
- AI agents must not run destructive commands unless explicitly requested and approved.
- AI agents must not leave long-running processes active unless the user asked for a running dev server.
- AI agents must provide verification results after changes.
- AI agents must stop and ask for direction when a task becomes ambiguous, dangerous, or broader than approved.

## 4. Git And Commit Rules

- One commit must contain one logical change.
- Maximum one feature per commit.
- Security, runtime, test, UX, docs, and performance changes must not be mixed in the same commit.
- Commit names must be specific and revertable.
- Before committing, run `git status --short` and review the changed files.
- Never commit `.env`, `.env.local`, `.env.production`, private keys, tokens, secrets, local build output, or unrelated user artifacts.
- Never use broad cleanup commits that hide source changes.
- Every pull request must list:
  - task ID
  - files changed
  - QA evidence
  - rollback method
  - security impact
  - manual review requirements

## 5. QA Gates

Every task must include QA evidence. The required gate depends on risk.

Baseline gates:

- `git status --short`
- affected-file review
- lint, typecheck, tests, or documented reason why not run
- acceptance criteria checked
- rollback method confirmed

Production-risk gates:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- targeted automated tests or documented manual QA
- security review for auth, admin, API key, wallet, withdrawal, trading, KYC, or session changes

Manual QA evidence must include:

- date
- environment
- route or command tested
- expected result
- actual result
- screenshots or logs when relevant

## 6. Security Rules

- No secrets in Git.
- No secret values in logs, docs, screenshots, tickets, prompts, or comments.
- All state-changing cookie-auth routes must have CSRF/origin protection unless explicitly documented otherwise.
- Admin access must never store raw admin tokens as session cookies.
- API-key signing must have replay protection in production.
- Rate limiting must be production-safe and multi-instance aware for sensitive routes.
- KYC, wallet signing, withdrawals, order execution, and balance operations must fail closed when dependencies are missing.
- Development mocks and local storage fallbacks must be blocked or explicitly gated in production.
- CSP, cookies, session duration, and auth fallback behavior must be reviewed before release.
- Any security regression blocks merge.

## 7. Documentation Rules

- Documentation must match implemented behavior.
- Stubs, mocks, deferred work, and feature gates must be named clearly.
- Deployment docs must match actual package scripts and process manager files.
- Security docs must match current auth, CSRF, session, API key, and admin behavior.
- Financial docs must distinguish simulated, gated, dry-run, and production-ready flows.
- Every phase must have:
  - plan
  - task board
  - QA evidence
  - closeout notes
  - known residual risks

## 8. Rollback Rules

- Every task must define a rollback method before implementation starts.
- Rollback must be possible by reverting a small commit whenever practical.
- Dangerous migrations must include forward and backward migration notes.
- Feature flags must default to safe behavior.
- Runtime changes must preserve or document an emergency fallback path.
- If rollback requires manual data repair, the task is high-risk and needs manual review before merge.

## 9. Definition Of Done

A task is done only when:

- the task is atomic
- acceptance criteria are met
- QA evidence exists
- rollback method is documented
- security impact is reviewed
- changed files match the approved scope
- no unrelated files are modified
- no secrets are introduced
- docs are updated when behavior changes
- CI or equivalent local checks pass, or failures are documented with owner approval

A feature is production-ready only when:

- code is implemented
- tests or manual QA evidence exist
- security risks are reviewed
- production fallback behavior is safe
- observability and error handling are adequate
- rollback is possible
- documentation reflects reality

## 10. Phase Execution Workflow

Each phase follows this workflow:

1. Audit current state.
2. Create or update the master plan.
3. Create or update the task board.
4. Prioritize P0 security and runtime blockers.
5. Execute one atomic task at a time.
6. Validate with the task QA gate.
7. Commit one logical change.
8. Record QA evidence.
9. Review rollback path.
10. Continue only after the previous task is mergeable.
11. Close the phase with documentation and residual-risk notes.

No phase may skip security, QA, or rollback review.

## 11. Rules For Codex, Claude, And GPT Collaboration

- Codex, Claude, and GPT must use the same task board and task IDs.
- Only one agent should own implementation for a task at a time.
- Agents must not overwrite each other's work.
- Agents must not make source changes from planning-only prompts.
- Agents must read existing files before editing.
- Agents must keep changes scoped to the active task.
- Agents must report commands run and validation results.
- Agents must flag uncertainty instead of guessing on security, compliance, wallet, trading, or deployment behavior.
- Agents must preserve user changes and local artifacts unless explicitly instructed otherwise.
- Agents must treat generated plans, audits, and task boards as engineering records.
- When agents disagree, the safest interpretation wins until a human lead decides.

