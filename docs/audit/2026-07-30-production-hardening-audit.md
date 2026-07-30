# TecPey Production Hardening Audit — 2026-07-30

Auditor: automated repository audit (evidence-based, file/line level).
Scope: security, production resilience, code quality — full pass over bootstrap,
edge proxy, session/JWT authority, CSRF, rate limiting, database access layer,
trading order service, sanctions screening, withdrawal compatibility gate,
HTTP security headers, structured logging, container image, and CI surface.

This pass re-verified every finding in `docs/audit/FINDINGS.md` against the
current `main` tree, then fixed the confirmed-open ones plus additional
defects found during the pass.

---

## 1. Executive summary

The repository is in far better shape than its audit trail suggests: most of
the historical critical findings (F-004 hardcoded production secrets, F-005
silent session-cookie failure) are **already fixed** on `main`. The codebase
follows a consistent fail-closed philosophy with durable authority checks.

This batch closes the remaining confirmed defects:

| ID | Severity | Status before | Status now |
|----|----------|---------------|------------|
| F-001 overfill guard missing in `updateOrderFill` | High | **Open** | Fixed (this PR) |
| F-002 Redis findAndRemove orphan risk | High | Open — documented recommendation | Not changed (see §4) |
| F-003 withdrawal recovery double-broadcast | Critical | Partially mitigated (canonical admission path uses advisory locks) | Not changed (see §4) |
| F-004 hardcoded dev secrets in production | Critical | Already fixed on `main` | Verified closed |
| F-005 `setUnifiedSessionCookie` swallowed signing errors | Medium | Already fixed (throws `setUnifiedSessionCookie_async_required`) | Verified closed |
| F-006 email validator accepts malformed addresses | Medium | **Open** | Fixed (this PR) |
| F-007 rate limiter trusts spoofable forwarding headers | High | **Open** | Fixed (this PR) |
| F-008 OFAC screening fails open on API outage | Critical | **Open** | Fixed (this PR) |
| F-009 withdrawal velocity TOCTOU race | High | **Open** (legacy gate; canonical path is PostgreSQL-atomic) | Fixed (this PR) |

Additional defects fixed in this batch (new findings, not in FINDINGS.md):

- **N-001** Runtime Postgres pool had no `statement_timeout`/`query_timeout` —
  one hung query could pin a pool connection (and its locks) indefinitely.
- **N-002** Rate-limit Redis key could be created **without TTL** if the
  `EXPIRE` call after `INCR` failed → permanent block of the identity.
- **N-003** Missing `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy`
  response headers.
- **N-004** Structured logger persisted context values for keys like `token`,
  `secret`, `authorization` in plaintext if a caller passed them.

---

## 2. Fixes in this PR

### F-001 — `updateOrderFill` overfill guard (`src/lib/trading/order-service.ts`)
Added `AND remaining_quantity >= $1` to the non-transactional variant so it
matches `updateOrderFillTx`. A 0-row result now correctly rejects late/invalid
fills instead of driving `remaining_quantity` negative.

### F-007 — Trusted client IP (`src/lib/rate-limit.ts`)
`getClientIp` now delegates to the existing governed authority
`src/lib/security/trusted-client-ip.ts`, which honors
`TECPEY_TRUSTED_PROXY_HEADER` / `TECPEY_TRUSTED_PROXY_HOPS` (already required
by `scripts/validate-env.mjs` and present in `.env.production.example` and CI
env). In production, when the contract cannot verify an address, requests fall
into one conservative shared bucket (`untrusted-identity`) instead of trusting
attacker-controlled headers. Non-production keeps the legacy header order for
local ergonomics.

### F-008 — OFAC fail-closed (`src/lib/compliance/ofac.ts`)
An unreachable or erroring screening API now returns `matched: true` with
`listName: "OFAC SDN (screening unavailable — fail-closed)"` so downstream
gates block for manual review instead of silently passing sanctioned parties.

### F-009 — Atomic velocity check (`src/lib/security/withdraw-gate.ts`)
The legacy compatibility gate's read-check-increment sequence is now a single
Redis Lua script (`GET` → limit check → `INCRBYFLOAT` → `EXPIRE NX`), closing
the TOCTOU window. All failure modes remain fail-closed with the same reason
codes as before.

### N-001 — Runtime DB pool timeouts (`src/lib/db.ts`)
Main pool now sets `statement_timeout` (default 15s) and `query_timeout`
(default 20s), configurable via `TECPEY_DB_STATEMENT_TIMEOUT_MS` /
`TECPEY_DB_QUERY_TIMEOUT_MS` (minimum accepted value 1s; invalid values fall
back to defaults). The readiness pool was already bounded; the runtime pool
was not.

### N-002 — Rate-limit key TTL atomicity (`src/lib/rate-limit.ts`)
Replaced the non-atomic `INCR` + conditional `EXPIRE` pair with one Upstash
pipeline: `SET key 0 PX <window> NX` + `INCR`. The key always carries a TTL
from the moment it exists.

### N-003 — COOP/CORP headers (`next.config.ts`)
Added `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Resource-Policy: same-origin`, complementing the existing
CSP `frame-ancestors 'none'` and `X-Frame-Options: DENY`.

### N-004 — Log secret redaction (`src/lib/logger.ts`)
Context fields whose key matches secret-like names (`secret`, `token`,
`password`, `authorization`, `api_key`, `credential`, `cookie`, `session_id`,
`jwt`, `private_key`, `refresh`) are emitted as `[redacted]`. Keys remain
visible for debuggability.

### F-006 — Email validator (`src/lib/api-validation.ts`)
Replaced the `\S+@\S+\.\S+` heuristic with an RFC 5322-flavoured practical
pattern that rejects double `@`, control/whitespace characters, hyphen-edge
labels, dot-less domains, and non-letter or single-character TLDs.

---

## 3. Verified strong areas (no change needed)

- **Bootstrap (`server.ts`)**: fail-closed Redis authority, custody kill-switch,
  single-web-node enforcement, controlled shutdown with drain, verify-only
  schema readiness (no DDL in web processes).
- **Edge proxy (`src/proxy.ts`)**: per-request CSP nonce with `strict-dynamic`,
  `unsafe-eval` only in development, route-context header overwrite, academy
  route auth gate.
- **Session authority**: unified sessions with durable JTI registration,
  deny-only revocation cache, strict mode for sensitive routes, immutable
  legacy-cookie hard sunset, production refusal of short/missing secrets.
- **CSRF**: origin verification fails closed when `NEXT_PUBLIC_SITE_URL` is
  unset in production.
- **Container**: digest-pinned base images, non-root runtime, npm removed from
  the runner stage, build commit SHA validated, healthcheck present.
- **HTTP headers**: HSTS (2y, preload), nosniff, DENY framing, tight
  Permissions-Policy, Referrer-Policy — all present and consistent with CSP.

---

## 4. Deliberately not changed in this batch

- **F-002 / F-003** (`order-book-store.ts`, wallet recovery worker): the
  recommendations touch matching-engine and withdrawal-recovery internals whose
  canonical production paths already enforce stronger authorities
  (PostgreSQL-advisory-locked admission, transactional evidence gates). A safe
  fix needs the engine's test harness running; flagged for the next batch.
- **CSP `img-src https:`**: intentionally broad to allow coin/exchange logos;
  tightening requires an asset allowlist review.
- **Secret minimum length (24 vs documented 32)**: code accepts ≥24 while
  `.env.production.example` mandates 32. Enforcing 32 in code would be a
  breaking change for existing deployments; recommend a startup warning first.

---

## 5. Follow-up recommendations (priority order)

1. Merge this PR, then run `npm run check` + the full `release:check` suite in
   CI (all heavy authority gates are already wired there).
2. Set `TECPEY_TRUSTED_PROXY_HEADER`/`TECPEY_TRUSTED_PROXY_HOPS` correctly for
   the real edge topology (Cloudflare → `cf-connecting-ip`, else `x-forwarded-for`
   with the exact hop count) — the F-007 fix depends on this contract.
3. Decide OFAC outage policy per flow: automatic block vs manual-review queue
   keyed on the new fail-closed `listName`.
4. Batch 2: order-book Redis durability (F-002) and recovery-worker
   deduplication (F-003) with engine tests running.
5. Add a startup warning when session secrets are 24–31 chars (docs demand 32).
6. Consider an allowlisted `img-src` once the asset inventory is reviewed.
