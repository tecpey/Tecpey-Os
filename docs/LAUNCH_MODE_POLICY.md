# Launch Mode Policy — TecPey Production Go/No-Go Framework

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Official
**Purpose:** Define the policy and criteria for determining when TecPey is ready for production launch.

---

## 1. Launch Mode Philosophy

TecPey operates in three modes. Every mode has explicit criteria. No mode is entered by default.

| Mode | Purpose | Audience |
|------|---------|----------|
| **Development** | Feature development, testing | Internal team |
| **Staging** | Integration testing, UAT | Internal team + beta testers |
| **Launch** | Public production | General public |

---

## 2. Launch Mode Exit Criteria

Production launch requires ALL of the following criteria to be met. A single unmet criterion blocks launch.

### 2.1 Security — No P0 Blockers

All P0 security blockers (see [[SECURITY_BLOCKERS.md]]) must be closed:

- [ ] CSRF enforced on all state-changing routes
- [ ] Admin sessions use signed opaque session tokens
- [ ] API key replay protection fails closed in production
- [ ] KYC does not return mock sessions in production
- [ ] HSM/MPC providers cannot be accidentally selected
- [ ] Internal endpoints are authenticated

### 2.2 Infrastructure — Production-Ready

- [ ] One authoritative production start path (npm, Docker, PM2, systemd aligned)
- [ ] Health endpoint reports DB, Redis, WebSocket, and worker status
- [ ] Environment validation rejects unsafe configurations
- [ ] Local JSON auth storage cannot be enabled in production
- [ ] CSP is production-tight (no broad `https:`/`wss:` fallbacks)

### 2.3 Financial Features — Safely Gated

- [ ] Incomplete financial features are feature-gated
- [ ] Withdrawal worker requires signing readiness
- [ ] Stop-limit orders are rejected with clear error
- [ ] No incomplete wallet provider can be triggered by normal users

### 2.4 Testing — Repeatable QA

- [ ] Test runner exists and executes in CI
- [ ] Wallet tests pass (or documented skips for missing infra)
- [ ] CI gates lint, typecheck, build, and tests

### 2.5 UX — Trustworthy

- [ ] English routes have correct lang/dir
- [ ] Contact forms are functional (not mailto-only)
- [ ] High-value pages have consistent metadata and accessibility

### 2.6 Performance — Measurable

- [ ] Performance baseline captured
- [ ] No blocking performance regressions
- [ ] Bundle analysis completed

### 2.7 Documentation — Accurate

- [ ] Deployment docs match actual runtime
- [ ] Security docs reflect current controls
- [ ] Required env vars documented in one canonical place
- [ ] Rollback procedures documented

---

## 3. Launch Decision Process

```
Phase Complete → QA Gate → Release Candidate → Launch Review → Go/No-Go
```

### Go/No-Go Authority

| Role | Authority |
|------|-----------|
| **Product Owner** | Final Go/No-Go decision |
| **Chief Architect** | Technical readiness assessment |
| **Security Lead** | Security blocker clearance |
| **Engineering Lead** | QA gate completion |

### Decision Types

| Decision | Meaning |
|----------|---------|
| **Go** | All criteria met. Launch. |
| **No-Go** | Unresolved blocker. Fix and re-evaluate. |
| **Conditional Go** | Minor non-blockers identified with documented remediation plan and timeline. |

---

## 4. Launch Rollback Plan

If launch reveals critical issues:

1. **Immediate:** Revert to previous stable version
2. **Short-term (24h):** Fix blocker + re-deploy
3. **Medium-term (7d):** Root cause analysis + permanent fix
4. **Long-term:** Process improvement to prevent recurrence

Rollback triggers:
- P0 security vulnerability discovered
- Data loss or corruption
- Authentication system failure
- Withdrawal processing errors
- Rate limiting failure under load

---

## 5. Post-Launch Modes

| Phase | Duration | Activities |
|-------|----------|------------|
| **Soft Launch** | 2 weeks | Limited users, active monitoring |
| **Full Launch** | Ongoing | Public availability, marketing |
| **Emergency** | As needed | Critical fix deployment, possible rollback |

---

## 6. Current Launch Readiness

**As of Phase 39.5: NOT LAUNCH READY**

| Category | Status | Blockers |
|----------|--------|----------|
| Security | ❌ Not ready | 6 P0 blockers identified |
| Infrastructure | ⚠️ Partially ready | PM2 path aligned; env validation needs expansion |
| Financial Features | ❌ Not ready | HSM/MPC stubs, mock KYC, stop-limit not rejected |
| Testing | ❌ Not ready | No test runner, no CI test gate |
| UX | ⚠️ Partially ready | Contact forms visual-only, English lang/dir issues |
| Performance | ❌ Not ready | Not measured |
| Documentation | ⚠️ Partially ready | Several docs need update |

**Estimated readiness target:** Phase 39.6 + Phase 40 completion

---

*Launch mode policy for Phase 39.5. Not ready for launch until all exit criteria are met.*
