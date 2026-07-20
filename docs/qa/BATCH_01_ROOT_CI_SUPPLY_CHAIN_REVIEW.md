# Batch 01 — Root, CI, Supply Chain and Runtime Bootstrap Review

**Program:** #156  
**Coordination PR:** #158  
**Reviewed source snapshot:** `9406085e4654548cf48555ea75c1f3f713b7d92b`  
**Status:** IN PROGRESS — this document is not a repository-wide completion claim.

## 1. Denominator

The exact-head inventory established the following repository denominator:

- tracked paths: **1,799**;
- textual files: **1,702**;
- binary files: **97**;
- generated files: **1**;
- text lines: **216,290**;
- tracked bytes: **28,627,083**.

Batch 01 contains:

- assigned files: **132**;
- assigned text lines: **31,766**;
- domains: repository root, GitHub governance/CI, supply-chain configuration, runtime/deployment and engineering operations.

The initial critical subset semantically reviewed in this report contains **18 files and 2,713 lines**:

- `.gitignore`;
- `README.md`;
- `package.json`;
- `tsconfig.json`;
- `eslint.config.mjs`;
- `next.config.ts`;
- `Dockerfile`;
- `docker-compose.production.yml`;
- `server.ts`;
- `src/proxy.ts`;
- all six current GitHub Actions workflows;
- `scripts/generate-repository-audit-inventory.mjs`;
- `scripts/scan-repository-lines.mjs`.

The remaining Batch 01 scripts, templates and root documents are still unreviewed semantically even though they are present in the automated denominator and line scan.

## 2. Automated evidence

The exact-head Repository Audit Evidence workflow passed and verified:

- every tracked path is represented once in the JSON inventory;
- every textual file is included in the line scanner;
- inventory and line scan are tied to the exact checked-out PR head;
- the exact tracked source tree is packaged for semantic review;
- generated reports remain workflow artifacts rather than committed source authority.

At the reviewed snapshot, the scanner evaluated **216,290 text lines** and emitted **946 review leads**:

| Severity label | Leads | Meaning |
|---|---:|---|
| P0 | 0 | No automatic secret/global-eval lead survived the refined production-source filters |
| P1 | 215 | Requires semantic review; not automatically a confirmed defect |
| P2 | 707 | Quality, configuration and maintainability review leads |
| P3 | 24 | TODO/FIXME/HACK ownership leads |

The highest-volume rules were external URL references, direct environment reads, financial numeric conversions, explicit `any`, direct JSON parsing and browser persistence. Pattern volume is not used as a defect count.

## 3. Confirmed findings

### B01-F01 — P0 — Browser-authoritative legacy Arena, journal and community evidence

**Issue:** #160

The semantic review confirmed that active production modules still preserve a second, forgeable browser authority beside the newer PostgreSQL Arena authority:

- `src/lib/trading-arena.ts` stores the Arena account, positions, orders, fees, PnL and scenarios in `localStorage` and generates identifiers/slippage with `Math.random()`;
- `src/lib/trading-journal.ts` stores journal evidence and identifiers locally;
- community profile, challenge, leaderboard, instructor and trading-DNA paths consume browser-owned evidence;
- active community pages import these legacy consumers.

This is a release blocker for reputation, rewards, instructor assessment, community evidence and Mentor decisions that consume the affected state. It does not invalidate the newer server-authoritative `/academy/trading-arena` execution client.

### B01-F02 — P0 — Mandatory security and financial audit evidence can be lost

**Issue:** #161

`src/lib/security/audit-log.ts` defines the general audit helper as fire-and-forget and deliberately suppresses persistence failure. Many credential, API-key, session, WebAuthn/2FA, order, withdrawal, Admin and risk paths use this helper.

The newer transactional sensitive-mutation audit system covers only a limited action set. Mandatory evidence is therefore not consistently admitted in the same transaction or a durable pre-effect outbox/state machine.

Sensitive actions can succeed while their required evidence is absent. P0 mutations must move to transactional or durable outbox audit authority; best-effort telemetry must be separated and clearly named.

### B01-F03 — P1 — Global lint configuration disables React correctness authority

**Issue:** #162

`eslint.config.mjs` globally disables hook-order, effect-state, ref, purity, immutability and explicit-`any` rules. CI therefore cannot prove important React and TypeScript correctness properties.

The remediation must be staged and baseline-driven. Enabling all rules followed by a broad auto-fix would be unsafe and unreviewable.

### B01-F04 — P1 — Production container, Compose and CI supply-chain gaps

**Issue:** #163

Confirmed gaps include:

- mutable base/service/action tags;
- complete builder dependencies copied into the runtime image;
- production execution through `tsx`;
- no container health check or retained SBOM/provenance evidence;
- literal placeholder PostgreSQL password in production Compose;
- dependency ordering without health gating;
- no explicit Redis authentication/private-network contract;
- inconsistent least-privilege workflow permissions and exact-head assertions;
- shutdown without explicit HTTP/WebSocket drain.

Any production environment using the placeholder credential is P0 unsafe. The program-level classification remains P1 until deployment use is verified.

### B01-F05 — P1 — Production CSP connection authority expands on misconfiguration

**Issue:** #164

`src/proxy.ts` broadens `connect-src` to generic HTTPS and WebSocket schemes when backend/socket configuration is missing or invalid. Extra connection sources are accepted without a strict origin/scheme parser.

Production security policy must fail closed and be validated by the environment contract instead of silently expanding browser egress authority.

### B01-F06 — P2 — Generated local audit evidence was not ignored

**Disposition:** fixed in PR #158.

The new QA commands write to `.artifacts/repository-audit/`, but `.gitignore` initially did not exclude `.artifacts`. This could create noisy untracked files or accidental commits. `/.artifacts/` has now been added to `.gitignore`.

## 4. Scanner lead reconciliation completed in this subset

### Direct `request.json()` leads

The scanner found 36 API files containing direct `request.json()` or `req.json()`. Semantic inspection established that every listed file also uses the governed bounded request-body helper before parsing the cloned request.

Therefore, these 36 matches are **not confirmed unbounded-body defects**. They remain a tooling-quality item: the scanner must become file-context-aware so it does not label a safe post-boundary parse as an independent P1 lead. The API Security Manifest remains the authoritative body-limit inventory.

### SQL interpolation leads

Six textual leads were examined:

- two Trading Arena reflection queries interpolate a static reviewed column-selection constant;
- one UI string matched because the earlier pattern recognized `Selected` as containing `SELECT`;
- audit/order/trade query builders assemble SQL only from fixed internal condition fragments and parameter placeholders in the reviewed lines;
- one user-trade market filter still performs manual quote escaping and remains assigned to the financial-query review batch because parameterization is preferable.

No SQL-injection defect is confirmed from the reviewed subset, but financial query construction remains subject to Batch 06 review.

### Non-cryptographic random leads

Five leads were found in legacy Arena/journal paths. They are not cryptographic-token generation, but they are part of confirmed finding B01-F01 because client-generated IDs, prices and slippage cannot become official Arena, reputation or Mentor evidence.

### Raw HTML leads

The reviewed occurrences are predominantly structured-data JSON-LD or server-owned content rendering. Each source and escaping boundary remains assigned to the UI/security batches; no blanket safety conclusion is recorded from pattern matching alone.

## 5. Positive controls observed

The review also confirmed several strong engineering controls:

- the primary CI executes clean PostgreSQL migrations and a second idempotency pass;
- TypeScript, zero-warning ESLint, full tests, production build and governed runtime smoke are present;
- dedicated authority gates exist for authentication, Mentor AI, withdrawals, Offline Sync, CRM, Academy, Arena, wallet, notifications, API security and Exchange order admission;
- production Redis is required by the custom server and invalid Redis URLs fail bootstrap;
- custody launch policy is asserted before workers start;
- withdrawal workers are not started when custody policy disables execution;
- production matching refuses to start when safe single-node authority cannot be established;
- the new repository-audit workflow uses read-only contents permission, disables persisted checkout credentials and asserts the exact PR head explicitly;
- the README now preserves real-money NO-GO language and distinguishes verified foundations from roadmap capability.

These controls reduce risk but do not close the confirmed findings above.

## 6. README review

`README.md` was rewritten as a bilingual engineering and product contract. The revised README includes:

- TecPey product definition and brand promise;
- education-first user value loop;
- product-system responsibilities;
- verified engineering reality and dated baseline;
- explicit real-money NO-GO boundaries;
- current P0 critical path;
- authority architecture and permanent invariants;
- security, privacy, Mentor AI, financial and custody posture;
- exact-head quality discipline and current CI gates;
- local, domain and release-oriented commands;
- repository map and authoritative documentation order;
- development/PR policy;
- explicit roadmap without presenting planned capability as implemented;
- a detailed Persian executive section.

README correctness remains governed by evidence. It must be updated again whenever merged remediation materially changes platform reality.

## 7. Current release decision

| Capability | Decision | Reason |
|---|---|---|
| Documentation and audit-framework development | CONDITIONAL GO | Exact-head audit workflow exists; semantic review is incomplete |
| Controlled non-financial development environment | CONDITIONAL GO | Existing CI controls are strong, but P0/P1 findings remain |
| Social reputation, challenge scoring and instructor evidence | NO-GO | Browser-authoritative evidence remains active (#160) |
| Credential, API-key, financial and privileged audit completeness | NO-GO | Mandatory audit evidence is not uniformly transactional (#161) |
| Production container/Compose contract | NO-GO for current unsafe defaults | Placeholder credential and supply-chain/runtime gaps (#163) |
| Unrestricted real-money Exchange/custody | NO-GO | Existing financial, custody, compliance, tenant and operational P0 gates remain |

## 8. Next Batch 01 work

1. Review all remaining root files, workflow templates and engineering scripts line by line.
2. Refine scanner context to reduce known safe bounded-body and static-SQL false positives.
3. Produce an action/image pin and permissions inventory for every workflow.
4. Verify README relative links, command existence and documentation authority references automatically.
5. Classify every environment read and every executable script by ownership and runtime reachability.
6. Confirm whether the production Compose file has ever been used unchanged; escalate #163 to P0 deployment incident if necessary.
7. Complete Batch 01 denominator reconciliation before marking this report final.

Batch 01 and the repository-wide program remain **OPEN**.