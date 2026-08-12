# TecPey Enterprise QA and Red-Team Report - 2026-08-12

**Audit date:** 2026-08-12
**Audited repository head:** `fc5bb931428738cd6357b60bf3090918e7f49539`
**Audited tree:** `dce26fb79004797462666de7ebb6544bba6f6452`
**Audit branch:** `agent/enterprise-qa-redteam-readme-20260812`
**Current controlled-launch candidate ledger:** `docs/launch/CURRENT_CONTROLLED_LAUNCH_CANDIDATE.md`
**Controlled-launch candidate SHA at audit time:** `55f2e92bb8238de17e0809fe54c389476517f57b`
**Decision:** **NO-GO** for controlled Soft Launch until remaining operational evidence is accepted.
**Hard boundary:** Real-money Exchange, custody, deposits, withdrawals, public financial rewards, enterprise activation and white-label activation remain **NO-GO**.

## Executive Verdict

TecPey has moved materially forward since the 2026-08-09 Go-readiness audit.
The repository now has accepted evidence or guarded acceptance for:

- `NOG-03`: immutable runtime image digest for the selected candidate.
- `NOG-04`: exact-head workflow URLs.
- `NOG-06`: rollback and synthetic PostgreSQL/Redis volume-restore mechanics.
- `NOG-10`, `NOG-11`, `NOG-12`: launch-disabled/product-disabled scope for real-money Exchange, custody/deposits/withdrawals, enterprise, white-label and public rewards.
- `NOG-08`: a fail-closed owner-signoff guard that prevents false closure. It does **not** close owner sign-off.

The current result is strong engineering progress, not launch approval. The
remaining blocking gates are still operational and executive-evidence gates:

| Gate | Current status | Strict impact |
|---|---|---|
| `NOG-01` | Open | No accepted protected staging activation evidence. |
| `NOG-02` | Open | No accepted production-like environment evidence. |
| `NOG-05` | Open | No protected staging recovery reconciliation evidence. |
| `NOG-07` | Open | No accepted incident readiness drill evidence. |
| `NOG-08` | Open | Owner sign-off evidence is still missing. |
| `NOG-09` | Open | Final Go approval matrix is still missing. |

The controlled education-first launch is closer, but the truthful release
decision remains **NO-GO**. The strongest current posture is: continue evidence
closure, keep all financial and enterprise capabilities disabled, and do not
send any support/install bundle as "final" until protected staging, recovery,
incident, risk-owner and approval evidence are attached.

## Enterprise Scorecard

These scores are strict management estimates for prioritization. They do not
override the Go/No-Go checklist.

| Domain | Score | Verdict | Reason |
|---|---:|---|---|
| Repository build and TypeScript quality | 9/10 | Strong | `npm run check` and `npm run build` passed on the audited head. |
| API and mutation security | 9/10 | Strong | 70 mutating operations have 0 governed findings; policy tests passed. |
| Sensitive mutation audit | 9/10 | Strong | Sensitive mutation, 2FA and WebAuthn transactional audit authorities passed. |
| Financial safety boundary | 8/10 | Strong but gated | Exchange, withdrawal and custody gates pass; production activation remains blocked. |
| Tenant and principal isolation | 8/10 | Improved but incomplete | 37 tenant-scoped tables registered; 31 proven; 6 still pending under #109. |
| AI Mentor trust boundary | 8/10 | Strong but partial | Prompt-injection, secret-canary and consent gates passed; durable DB tests skipped without database. |
| Public UI/product truth | 7/10 | Good, needs runtime proof | Public UI and disabled-capability copy guards passed; local browser Golden Path was blocked by missing Redis. |
| Operational readiness | 5/10 | Not accepted | Recovery authority tests pass, but protected staging, incident and domain recovery evidence are missing. |
| Multi-tenant/SaaS/white-label | 4/10 | Roadmap only | Guarded direction exists; runtime remains deliberately single tenant. |
| Full public production launch | 4/10 | NO-GO | Operational, compliance, approval and product evidence remain incomplete. |

## Evidence Run In This Audit

| Command | Result | Notes |
|---|---|---|
| `npm run launch:decision:check` | PASS | Decision authority remains NO-GO by default; candidate, workflow, rollback, disabled-capability, gated-capability and risk-signoff guards passed. |
| `npm run check` | PASS | ESLint, lint authority, authority tests and TypeScript passed. |
| `npm run build` | PASS with warning | Next.js build and server bundle passed; static generation logged missing `DATABASE_URL`, expected in this sandbox and relevant to `NOG-02`. |
| `npm run env:check` | FAIL in sandbox | Missing production URLs, secrets, proxy settings and `DATABASE_URL`; this is expected locally and confirms protected staging env evidence is still required. |
| `npm run api:security:check` | PASS | 70 mutating operations, 0 governed findings, 0 active exact exceptions. |
| `npm run test:api-security-manifest` | PASS | 68 policy tests passed. |
| `npm run audit:sensitive:check` | PASS | Sensitive mutation, 2FA and WebAuthn audit authorities passed. |
| `npm run auth:check` | PASS | Session authority, strict revocation and legacy retirement boundaries passed. |
| `npm run bounded-body:check` | PASS | 48 direct handlers and 1 canonical alias covered. |
| `npm run test:bounded-body` | PASS | 13 bounded JSON body tests passed. |
| `npm run ai:redteam:check` | PASS with skips | 14 AI trust tests passed; 8 durable PostgreSQL tests skipped without DB. |
| `npm run academy:progress:check` | PASS | Browser and legacy section surfaces cannot issue official progress, XP or unlocks. |
| `npm run crm:check` | PASS | CRM lead authority, consent, encryption/redaction, delivery and retention controls passed. |
| `npm run exchange:check` | PASS | Admission, evidence and reconciliation authorities passed. |
| `npm run withdrawals:check` | PASS | Admission, pre-broadcast, runtime and external-effect evidence guards passed. |
| `npm run custody:check` | PASS | Production custody launch gate passed. |
| `npm run test:custody-gate` | PASS | 19 custody policy/runtime tests passed. |
| `npm run risk:check` | PASS | PostgreSQL owns durable risk decisions and Redis projection debt is repairable. |
| `npm run redis:safety:check` | PASS | Startup and runtime Redis dependency failures fail closed. |
| `npm run notifications:check` | PASS | Notification persistence authority passed. |
| `npm run notifications:runtime:check` | PASS | Runtime scheduling, lease, retry and DLQ controls passed. |
| `npm run notifications:producers:check` | PASS | Producer authority, templates, provenance and destinations passed. |
| `npm run notifications:domain:check` | PASS | Domain outbox authority passed. |
| `npm run offline:check` | PASS | Tenant/principal binding, signed scope, audited browser queue and exactly-once application passed. |
| `npm run tenant:isolation:check` | PASS | 37 tenant-scoped tables all registered; 31 proven; 6 pending under #109. |
| `npm run test:tenant-isolation-coverage` | PASS | 6 coverage policy tests passed. |
| `npm run migrations:check` | PASS | Migration authority passed. |
| `npm run test:readiness` | PASS | 9 migration/readiness tests passed. |
| `npm run test:startup` | PASS | 7 database startup authority tests passed. |
| `npm run supply-chain:check` | PASS | Production supply-chain authority and 47 policy/preflight tests passed. |
| `npm run ops:recovery:check` | PASS | Operational recovery authority passed. |
| `npm run test:ops-recovery-authority` | PASS | 16 recovery policy/evidence tests passed. |
| `npm run browser:persistence:check` | PASS | 25 classified browser-persistence lines across 7 production files; no official evidence drift. |
| `npm run audit:hygiene:json` | PASS | 2348 files scanned; 0 suspicious artifacts; hygiene debt remains visible. |
| `npm run test:e2e:public` | BLOCKED by local Redis | Browser QA infrastructure could not observe Redis at `127.0.0.1:6379`. This does not invalidate existing GitHub Golden Path evidence, but local browser evidence was not collected here. |
| `npm --prefix tests/e2e run test:stub` | PASS | 19 browser QA harness/stub/process isolation tests passed. |
| `npm run security:secrets:check` | PASS | Secret-scanning authority reported Gitleaks 8.30.1 and 55 exact reviewed identities. |
| `npm run ip:ownership:check` | PASS | Source ownership, proprietary delivery and support handoff boundaries passed. |
| `npm run release:coverage:check` | PASS | All 54 `release:check` gates are reachable from 14 workflows. |

## Red-Team Findings

### P0-RT-001 - Protected staging is not accepted

**Status:** Open.
**Evidence:** `NOG-01`, `NOG-02`, `docs/launch/generated/protected-staging-execution-status-20260812.json`.
**Risk:** A build can pass locally and in CI while the protected host path, runner, environment, service manager, database URL and redacted env evidence remain unproven.
**Required closure:** Configure protected GitHub Environment controls, execute the protected staging runbooks on the intended runner, attach accepted artifacts and detached digests, and verify them offline.

### P0-RT-002 - Domain recovery reconciliation is not accepted

**Status:** Open.
**Evidence:** `NOG-05`, `docs/operations/RECOVERY_RECONCILIATION_CONTRACT.md`.
**Risk:** Synthetic volume restore evidence is accepted for `NOG-06`, but it does not prove that Academy, Arena, Mentor, Exchange ledger, notifications/jobs, tenant/principal isolation and audit trails reconcile on protected staging.
**Required closure:** Execute protected staging restore plus domain reconciliation and attach the verified artifact and digest.

### P0-RT-003 - Incident readiness is not accepted

**Status:** Open.
**Evidence:** `NOG-07`, `docs/operations/INCIDENT_READINESS_CONTRACT.md`, `docs/launch/generated/incident-readiness-evidence-request-20260812.json`.
**Risk:** Operators could deploy an otherwise good artifact without proven critical alert delivery, acknowledgement, support windows or escalation.
**Required closure:** Run critical alert probes, prove latency, pending/quarantine state and P0 acknowledgement, then attach evidence that passes `scripts/verify-incident-readiness-evidence.mjs`.

### P0-RT-004 - Sign-off and final approvals are missing

**Status:** Open.
**Evidence:** `NOG-08`, `NOG-09`, `docs/launch/generated/accepted-risk-signoff-evidence-20260812.json`.
**Risk:** The repository now blocks false NOG-08 closure, but no externally attributable owner approval or final Go matrix is attached.
**Required closure:** Add owner approval evidence and the final Go approval matrix for the exact candidate and launch scope.

### P0-RT-005 - Financial and enterprise activation remains prohibited

**Status:** Hard NO-GO.
**Evidence:** Disabled capability attestation accepts only launch-disabled/product-disabled scope.
**Risk:** Real-money Exchange, custody, deposits, withdrawals, public rewards, enterprise and white-label claims would be unsafe and untruthful if activated from current evidence.
**Required closure:** Separate certification for provider evidence, reconciliation, custody/HSM/MPC, compliance, legal, disaster recovery, operations and enterprise tenancy.

### P1-RT-006 - Local public browser Golden Path could not run

**Status:** Blocked by local infrastructure.
**Evidence:** `npm run test:e2e:public` failed before UI assertions because Redis observer at `127.0.0.1:6379` was unavailable.
**Risk:** This local audit did not collect new browser runtime evidence, though exact-head GitHub Golden Path evidence is already accepted for `NOG-04`.
**Required closure:** Run local Redis or rely on the governed GitHub Browser Golden Path workflow for exact-head evidence; do not count this local blocked run as UI pass.

### P1-RT-007 - Build emits missing database configuration logs in sandbox

**Status:** Warning.
**Evidence:** `npm run build` passed but emitted repeated `DATABASE_URL is not set or is a placeholder` logs during static generation.
**Risk:** The project is correctly fail-closed for missing DB configuration, but build-time routes still touch DB-aware modules enough to create noisy production-looking errors in sandbox builds.
**Required closure:** Preserve fail-closed behavior, but consider isolating build-time public rendering from DB diagnostics or documenting the expected warning in local audit guidance.

### P1-RT-008 - Multi-tenant progress improved but is not production SaaS

**Status:** Partial.
**Evidence:** `tenant:isolation:check` reports 37 tenant-scoped tables registered, 31 proven, 6 pending under #109.
**Risk:** A strong registry does not equal complete tenant runtime, billing, admin control plane, per-tenant keys, domain routing or white-label activation.
**Required closure:** Finish #109 pending tables, then close #20 and #13 with runtime tenant configuration and enterprise admin evidence.

### P2-RT-009 - Browser persistence remains visible debt

**Status:** Governed.
**Evidence:** `browser:persistence:check` reports 25 classified matching lines across 7 production files.
**Risk:** The current classifier prevents official source-of-truth drift, but browser state remains a place where accidental authority can return.
**Required closure:** Continue replacing or quarantining browser persistence until only transport-only or disposable presentation state remains.

### P2-RT-010 - Repository hygiene debt remains visible

**Status:** Non-blocking, tracked.
**Evidence:** `audit:hygiene:json` scanned 2348 files, found 0 suspicious artifacts, two zero-byte charting-library CSS files, large third-party/static assets, 18 orphan candidates, and source markers including `localStorage`, `sessionStorage`, `todo`, `fixme`, `hack` and `legacy`.
**Risk:** None of these are deletion approvals, but they are audit surface and future regression risks.
**Required closure:** Triage orphan candidates and source markers in bounded cleanup PRs; avoid touching third-party charting assets unless replacement is planned.

## Attack Surface Review

| Surface | Probe | Result | Residual risk |
|---|---|---|---|
| Product truth | Disabled capability attestation and launch decision checks | PASS | Any public copy drift can still become a NO-GO if it overclaims Exchange/custody/enterprise readiness. |
| API mutation security | Manifest generator plus 68 policy tests | PASS | Runtime evidence still depends on exact deployed artifact and protected env. |
| Request body handling | Bounded body authority and tests | PASS | New handlers must stay enrolled. |
| Auth/session | Session authority and strict revocation checks | PASS | Full DB/Redis runtime should still be proven in protected staging. |
| AI Mentor | Trust boundary red-team and provider tests | PASS with DB skips | Durable consent/evidence paths need real database execution in protected evidence. |
| Exchange | Admission, final evidence and reconciliation guards | PASS | Real-money activation remains separately blocked. |
| Withdrawal | Admission, pre-broadcast and external-effect guards | PASS | Broadcast/custody activation remains separately blocked. |
| Custody | Launch policy and runtime guard tests | PASS | No production HSM/MPC/key ceremony evidence exists. |
| Tenant isolation | Registry and coverage tests | PASS | 6 tables remain pending and runtime stays single tenant. |
| Offline sync | Authority and queue capacity | PASS | Cross-device recovery remains protected-staging evidence work. |
| Notifications | Persistence/runtime/producer/domain outbox | PASS | Multichannel SMS/email/push campaigns are not complete. |
| Recovery | Authority and policy tests | PASS | Protected staging domain reconciliation is missing. |
| Supply chain | Production supply-chain guard and tests | PASS | Final support/installable bundle still needs accepted evidence before handoff. |
| Browser QA | Local Golden Path attempted | BLOCKED | Redis observer missing locally; use governed GitHub evidence or run Redis. |

## Launch Boundary After This Audit

| Capability | Current allowed posture | Decision |
|---|---|---|
| Public FA/EN informational surface | Controlled review only | Not final Go without protected evidence. |
| Academy | Controlled scope | Allowed only after remaining controlled-launch blockers close. |
| Mentor AI | Bounded educational assistance | Allowed only with consent and provider/runtime evidence. |
| Virtual Trading Arena | Simulated practice | Allowed only as virtual, non-financial evidence. |
| Real-money Exchange | Disabled | NO-GO. |
| Custody/deposits/withdrawals | Disabled | NO-GO. |
| Public financial rewards | Disabled | NO-GO. |
| Enterprise/white-label | Roadmap and gated docs only | NO-GO. |
| Multi-tenant SaaS | Architecture program | NO-GO for activation. |

## Required Next Work

1. Close `NOG-01` and `NOG-02` with protected staging activation and redacted env evidence.
2. Close `NOG-05` with protected staging recovery reconciliation across Academy, Arena, Mentor, Exchange ledger, notifications/jobs, tenant/principal isolation and audit trails.
3. Close `NOG-07` with incident readiness evidence, critical alert probes and P0 acknowledgement that pass `scripts/verify-incident-readiness-evidence.mjs`.
4. Close `NOG-08` with externally attributable owner sign-off evidence.
5. Close `NOG-09` with the final Go approval matrix for CEO, CTO/Chief Architect, Security, Product, Compliance, SRE and QA.
6. Keep `NOG-10`, `NOG-11` and `NOG-12` accepted only as disabled-scope evidence; do not activate any related capability.
7. Re-run public browser Golden Path in an environment with Redis observer available or rely on exact-head GitHub evidence.
8. Treat PR #396 or any later support-bundle PR as an installability hardening step only; do not present support ZIP delivery as authorized until the remaining NO-GO evidence closes.

## Bottom Line

TecPey is moving like a serious enterprise codebase now: authority scripts,
policy tests, exact-head evidence, financial gates, product-truth guards and
source ownership controls are real and increasingly difficult to bypass.

The remaining blockers are no longer "write more app pages" problems. They are
evidence, operations, runtime, approval and truth-in-launch problems. The strict
answer is therefore:

**Codebase governance is substantially stronger. Controlled Soft Launch remains
NO-GO. Real-money and enterprise activation remain hard NO-GO.**
