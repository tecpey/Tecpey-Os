# TecPey Constitution — Permanent Operating Standard

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Permanent — supersedes `docs/engineering/governance/ENGINEERING_CONSTITUTION.md`
**Scope:** All engineering, documentation, security, and release work on the TecPey platform

---

## Preamble

TecPey handles education, identity, security, trading, wallets, and financial-risk workflows. Engineering work must therefore be small, auditable, reversible, tested, and explicit. Speed is valuable only when it does not compromise safety, user trust, or production reliability.

This constitution is the binding operating standard for all TecPey engineering work. No AI agent, contractor, or team member may deviate from these rules without explicit Product Owner approval documented in the phase task board.

---

## Article I — Atomic Work

**I.1** Every task must be atomic: one task equals one logical change.
**I.2** Every task must be independently mergeable.
**I.3** Every task must have QA evidence.
**I.4** Every task must be rollbackable.
**I.5** No large multi-feature commits. Security, runtime, test, UX, docs, and performance changes must not be mixed in the same commit.
**I.6** If implementation scope expands, split the work into new atomic tasks before proceeding.

---

## Article II — Source Code

**II.1** No source code change may be made without a clear task, acceptance criteria, validation plan, and rollback method.
**II.2** No production-facing feature is production-ready without automated tests or documented manual QA evidence.
**II.3** Financial, wallet, auth, admin, KYC, trading, and withdrawal changes are high-risk by default. Every such change requires explicit security review.
**II.4** Development fallbacks must never silently become production behavior.
**II.5** Generated files, local artifacts, and user files must not be committed unless explicitly approved.
**II.6** Existing user changes must not be reverted without explicit permission.
**II.7** Every pull request must list: task ID, files changed, QA evidence, rollback method, security impact, manual review requirements.

---

## Article III — AI Agents

**III.1** AI agents must read the relevant plan, task board, and source files before proposing or editing code.
**III.2** AI agents must not modify source code when the user asks for planning, review, or documentation only.
**III.3** AI agents must state which files they intend to edit before editing.
**III.4** AI agents must use small patches and avoid unrelated refactors.
**III.5** AI agents must not invent production readiness; they must distinguish implemented, stubbed, gated, and documented behavior.
**III.6** AI agents must not inspect or expose secrets.
**III.7** AI agents must not run destructive commands unless explicitly requested and approved.
**III.8** AI agents must not leave long-running processes active unless the user asked for a running dev server.
**III.9** AI agents must provide verification results after changes.
**III.10** AI agents must stop and ask for direction when a task becomes ambiguous, dangerous, or broader than approved.

---

## Article IV — Git & Commits

**IV.1** One commit must contain one logical change. Maximum one feature per commit.
**IV.2** Commit names must be specific and revertable. Use the format: `category: specific description`.
**IV.3** Before committing, run `git status --short` and review the changed files.
**IV.4** Never commit `.env`, `.env.local`, `.env.production`, private keys, tokens, secrets, local build output, or unrelated user artifacts.
**IV.5** Never use broad cleanup commits that hide source changes.
**IV.6** Branches: main remains protected. Work in feature branches. Use separate PRs for P0 security, runtime, test harness, financial gating, UX/SEO, performance, and docs.
**IV.7** Every merged PR must include QA evidence and rollback notes.

---

## Article V — QA Gates

**V.1** Baseline gates for every task:
- `git status --short` reviewed
- Affected-file list reviewed
- Lint, typecheck, tests pass (or documented reason why not)
- Acceptance criteria confirmed
- Rollback method confirmed

**V.2** Production-risk gates (required for high-risk changes):
- `npm run lint` — 0 errors, 0 warnings
- `npm run typecheck` — 0 errors
- `npm run build` — clean build
- Targeted automated tests or documented manual QA
- Security review for auth, admin, API key, wallet, withdrawal, trading, KYC, or session changes

**V.3** Manual QA evidence must include: date, tester, environment, steps, expected/actual results, screenshots or logs where applicable.

**V.4** CI enforces: `npm ci`, `tsc --noEmit`, `eslint . --max-warnings 0`, `npm run build`.

---

## Article VI — Documentation

**VI.1** Every phase produces or updates governance documents before feature implementation begins.
**VI.2** Documentation must be in Persian where user-facing or strategic meaning matters; English may be used for engineering clarity.
**VI.3** Do not duplicate knowledge. Cross-reference existing documents via `[[DocumentName]]` links.
**VI.4** Mark old documents as superseded instead of deleting them.
**VI.5** No document may contain aspirational claims without a Phase target.
**VI.6** Every document must state its date, phase, and status.

---

## Article VII — Security

**VII.1** All state-changing API routes must enforce CSRF origin verification or have documented exemption with security review approval.
**VII.2** Admin sessions must use signed opaque session tokens, not raw credential values.
**VII.3** Production mode must fail closed for any security-critical service that is unconfigured.
**VII.4** All secrets must be in environment variables. No hardcoded secrets in source code.
**VII.5** Wallet private keys must be zeroed from memory immediately after use.
**VII.6** Rate limiting must be enforced on every public endpoint.
**VII.7** Security vulnerabilities must be reported via `security@tecpey.ir` — never via public GitHub issues.

---

## Article VIII — Release Management

**VIII.1** Every release must have a documented scope, QA gate results, and rollback plan.
**VIII.2** No release may include untracked, unclassified artifacts in the working tree.
**VIII.3** Financial features must be feature-gated and cannot be enabled by accident in production.
**VIII.4** A release is complete only when its acceptance checklist passes.
**VIII.5** Post-release, update the changelog and mark superseded documents.

---

## Article IX — Amendment

**IX.1** This constitution may be amended only by explicit Product Owner decision.
**IX.2** Amendments must be documented with date, reason, and previous text preserved.
**IX.3** The constitution is reviewed at the start of every major phase.

---

*این قانون اساسی مهندسی تک‌پی است. تمام کارهای مهندسی باید با این اصول سازگار باشد.*
*This is the TecPey engineering constitution. All engineering work must be consistent with these principles.*
