# TecPey — Repository Asset Audit: FINDINGS

Auditor role: software asset auditor (evidence-based verification only).
Repository: `tecpey` (crypto exchange / trading + academy platform, Next.js 16, TypeScript).
Method: targeted inspection of high-value financial assets (matching, ledger, wallet, withdrawal). Each finding is backed by file/line evidence.

---

## F-001 — `updateOrderFill` (non-Tx) lacks the overfill guard present in `updateOrderFillTx`

- **ID:** F-001
- **Severity:** High
- **Confidence:** High
- **File:** `src/lib/trading/order-service.ts`
- **Line numbers:** 267–293 (vulnerable `updateOrderFill`); compare 203–231 (`updateOrderFillTx`)

### Evidence
`updateOrderFillTx` (transaction-aware variant) guards the fill UPDATE with a
`WHERE ... AND remaining_quantity >= $1` clause (line 222):

```
WHERE id = $4::uuid AND remaining_quantity >= $1
```

The standalone `updateOrderFill` variant performs the identical arithmetic
(`filled_quantity = filled_quantity + $1`, `remaining_quantity = remaining_quantity - $1`)
but its WHERE clause omits the `remaining_quantity >= $1` guard (line 285):

```
WHERE id = $4::uuid
```

### Root cause
The overfill safety predicate was added to the `*Tx` variant but not mirrored
onto the convenience variant. The two functions are otherwise line-for-line
equivalent, so the omission is an inconsistency rather than an intentional
design difference.

### Production impact
Any caller path that uses `updateOrderFill` (rather than `updateOrderFillTx`)
can apply a fill larger than the order's `remaining_quantity`, driving
`remaining_quantity` negative and `filled_quantity` above the original order
`quantity`. Because these columns feed order status, VWAP `avg_fill_price`, and
downstream balance settlement, this corrupts order accounting and can release/
debit more asset than the order authorized. On an exchange this is a
direct financial-integrity defect.

### Recommended fix
Add `AND remaining_quantity >= $1` to the `updateOrderFill` WHERE clause so it
matches `updateOrderFillTx`, and treat a 0-row result as a rejected/late fill.
Prefer deleting the non-Tx variant entirely and routing all fills through the
transaction-aware path so fill + balance + ledger mutate atomically.

---

## F-002 — `RedisOrderBookStore.findAndRemove` can leave orphaned orders in Redis on write failure

- **ID:** F-002
- **Severity:** High
- **Confidence:** High
- **File:** `src/lib/trading/order-book-store.ts`
- **Line numbers:** 215–229

### Evidence
`RedisOrderBookStore.findAndRemove` (line 215) calls `super.findAndRemove(market, entry)`
which synchronously removes the order from the in-memory book. It then fires
an async Redis pipeline to clean up the same order with no retry and no
synchronization:

```
void this.redis.pipeline()
  .zrem(key, member)
  .del(`tecpey:order:${orderId}`)
  .exec()
  .catch((err) => logger.warn("[order-book-store] Redis findAndRemove failed", { err }));
```

If the Redis call fails (connection error, timeout, etc.), the order is
permanently removed from the in-memory book but remains in Redis. On the next
process restart, `warmFromRedis` (line 287) reads from Redis and re-inserts
the order into the in-memory book via `super.insert` (line 299), resurrecting
a cancelled order as a live resting order.

### Root cause
The Redis write-through is fire-and-forget with no durability guarantee.
The in-memory mutation commits before Redis confirms, and a Redis failure
is logged but not retried or propagated.

### Production impact
Cancelled orders can re-appear as live resting orders after restart.
On a crypto exchange, a maker order that was cancelled (funds released) could
re-enter the book, get matched, and cause the system to attempt a second fill
for an order the user already cancelled. This results in incorrect trade
execution, incorrect balance debits, and a user having funds held for an order
they believe was cancelled.

### Recommended fix
Make Redis cleanup synchronous (await the pipeline) before removing from
in-memory, or use a two-phase approach: mark as "pending cancel" in Redis,
remove from memory, then confirm Redis cleanup. Alternatively, add a
reconciliation sweep that detects orders in Redis not present in the
in-memory index on startup and cleans them up.

---

## F-003 — Recovery worker has no concurrency guard; concurrent recovery jobs double-broadcast a stuck withdrawal

- **ID:** F-003
- **Severity:** Critical
- **Confidence:** High
- **File:** `src/lib/wallet/queue/processor.ts` (lines 99–118) and `src/lib/wallet/withdrawal-executor.ts` (lines 31–146)
- **Line numbers:** processor.ts 101–118; executor.ts 52–62

### Evidence
`createRecoveryWorker` (processor.ts 101) creates a worker with `concurrency: 2`.
`executeWithdrawal` (executor.ts 31) checks idempotency only via `withdrawal.txHash`
(lines 57–62). If a withdrawal is stuck in "broadcasting" state (txHash is null),
the idempotency check passes and the worker proceeds to build/sign/broadcast.

With `concurrency: 2`, two recovery jobs for the same withdrawalId can be active
simultaneously. Both pass the `txHash === null` check and both attempt to broadcast.

Additionally, `broadcastTransaction` (executor.ts 150) catches "already known"
errors (line 201) but throws a new error without extracting the txHash from the
RPC response (line 205). This means a duplicate broadcast response (which usually
includes the existing txHash) is discarded, leaving the withdrawal stuck.

### Root cause
1. Recovery worker concurrency > 1 with no distributed lock on withdrawalId.
2. Idempotency check only guards "already broadcast" (txHash set), not
   "currently being broadcast" (state = broadcasting).
3. "Already known" RPC error is treated as a failure rather than a success path
   that extracts the existing txHash.

### Production impact
A stuck withdrawal (e.g., RPC timeout after broadcast but before tx_hash
persistence) can be recovered by two concurrent workers, causing:
- Two blockchain transactions for the same withdrawal (double-spend).
- The user's funds are sent twice. On an irreversible chain (Bitcoin), this
  is a permanent loss of funds with no technical recovery mechanism.

### Recommended fix
1. Add a distributed lock (Redis SETNX or BullMQ job deduplication by key)
   on withdrawalId before entering `executeWithdrawal`.
2. Change idempotency check to also guard against state = "broadcasting"
   (a withdrawal in that state with no txHash should not be re-broadcast).
3. Parse the txHash from "already known" / "AlreadyProcessed" RPC error
   responses and persist it instead of throwing.

---

## F-004 — Auth falls back to hardcoded dev secrets in production when env vars are missing

- **ID:** F-004
- **Severity:** Critical
- **Confidence:** High
- **File:** `src/lib/auth-session. ts`
- **Line numbers:** 72–90

### Evidence
`academyAuthKey()` (line 72) and `sessionKey()` (line 82) both return hardcoded
fallback secrets when the required env var is missing or too short:

```
return new TextEncoder().encode("tecpey- local- academy-auth- dev-secret- please- set- env");
return new TextEncoder().encode("tecpey- local- student- session- dev-secret- please- set- env");
```

These are used in `verifyAcademyAuth` and `verifyUserSession` respectively.
In `unified-session. ts` line 40–41, `unifiedSecret()` similarly returns:

```
return new TextEncoder().encode("tecpey- local- unified- session- dev-secret- please- set- env");
```

The fallback is only gated by `NODE_ENV !== "production"` for the academy and
student session keys — but `unifiedSecret()` uses `NODE_ENV !== "production"`
for its fallback, meaning all three paths can use the hardcoded secret in
production if the env var is missing.

### Root cause
The fallback secrets were added for local development ergonomics but the
production guard (`NODE_ENV === "production"`) is missing or inconsistent across
the three auth key functions. An operator who deploys without setting the
required env vars gets a running system that signs and verifies JWTs with a
publicly known secret.

### Production impact
An attacker who knows the hardcoded secret can:
- Forge arbitrary academy_auth, student_session, and unified session JWTs.
- Impersonate any user, including admin users.
- Access all authenticated endpoints including withdrawal APIs.
This is a complete account takeover vulnerability.

### Recommended fix
In production (`NODE_ENV === "production"`), throw or return null immediately
when the required secret is missing or too short. Remove all hardcoded fallback
secrets from production code paths. Add a startup check (e.g., in `server. ts`)
that verifies all required secrets are present before accepting connections.

---

## F-005 — `setUnifiedSessionCookie` swallows signing errors silently

- **ID:** F-005
- **Severity:** Medium
- **Confidence:** High
- **File:** `src/lib/unified-session. ts`
- **Line numbers:** 122–135

### Evidence
`setUnifiedSessionCookie` (line 122) calls `signUnifiedSession` asynchronously
and attaches `.catch()` handlers that only log the error:

```
signUnifiedSession(data).then((token) => {
  response.cookies.set(UNIFIED_SESSION_COOKIE, token, { ... });
}).catch((err) => {
  logger.error("[unified-session] failed to sign session cookie", { error: msg });
});
```

The function returns `void` immediately, before the Promise resolves. The
caller receives no indication that the session cookie was not set.

### Root cause
The async cookie setter was designed as a fire-and-forget convenience wrapper.
Errors are caught and logged but not propagated.

### Production impact
If JWT signing fails (e.g., secret key unavailable, clock skew, or unexpected
encoding error), the user logs in successfully from the application's
perspective but receives no session cookie. The login appears to succeed
(server returns 200) but the user is not authenticated on subsequent requests.
This creates a silent login failure that is difficult to debug and may cause
users to repeatedly attempt login without understanding why they remain logged
out. The async version `setUnifiedSessionCookieAsync` (line 138) does not have
this problem and should be preferred.

### Recommended fix
Remove `setUnifiedSessionCookie` or deprecate it. Ensure all callers use
`setUnifiedSessionCookieAsync` which awaits the signing and propagates errors.

---

## F-006 — Email validator regex accepts malformed addresses

- **ID:** F-006
- **Severity:** Medium
- **Confidence:** High
- **File:** `src/lib/api-validation. ts`
- **Line numbers:** 38–41

### Evidence
The `Validate.email` validator uses the regex `/^\S+@\S+\.\S+$/` (line 40).
This accepts any string with at least one non-whitespace character, an `@`,
another non-whitespace, a `.`, and at least one more non-whitespace character.
It accepts these invalid inputs:

- `admin@@example.com` (double @)
- `admin@ x.com` (space in local part — stripped by `.trim().toLowerCase()` but the space is inside the string before the `@`)
- `admin@x` (no TLD separator)
- `a@b.c` (single-character TLD)
- `<script>alert(1)</script>@x.com` (no HTML encoding/escaping of angle brackets before the @)

### Root cause
The regex is a simplified check that does not conform to RFC 5322 or even
RFC 5321 (the SMTP specification). It was written as a quick heuristic rather
than a standards-compliant validator.

### Production impact
Malformed email addresses stored in the database can cause:
- Email delivery failures (bounces from mail servers that reject non-RFC-compliant addresses).
- Bounce rate increases that damage sender reputation with email service providers.
- Potential injection risks if these addresses are used in email templates
  without proper escaping.
- Inconsistent user identification if the same user registers with both a
  valid and an invalid variant of the same address.

### Recommended fix
Replace with a standards-compliant email validator. The `email-validator` npm
package (or Node's built-in WHATWG URL parsing) provides RFC 5322-compliant
validation. Alternatively, use Zod's built-in email schema which handles this
correctly.

---

## F-007 — Rate limiter trusts X-Forwarded-For header, enabling IP spoofing

- **ID:** F-007
- **Severity:** High
- **Confidence:** High
- **File:** `src/lib/rate-limit. ts`
- **Line numbers:** 45–52

### Evidence
`getClientIp` (line 45) extracts the client IP from request headers in this
preference order:

```
cf-connecting-ip  // Cloudflare (trusted if behind CF)
x-forwarded-for   // Can be set by any client
x-real-ip        // Can be set by any client
"local"
```

`x-forwarded-for` and `x-real-ip` are client-supplied headers that any HTTP
client can set arbitrarily. An attacker can bypass IP-based rate limiting by
setting these headers to a different IP on every request (or to a trusted
IP range), making the rate limiter ineffective.

### Root cause
The function trusts `X-Forwarded-For` and `X-Real-IP` without validating that
the request actually came through a trusted proxy. In a deployment behind a
load balancer or CDN, these headers should only be trusted from the proxy's
IP range — but no such validation exists.

### Production impact
An attacker can circumvent IP-based rate limiting by spoofing the
`X-Forwarded-For` header, enabling:
- Brute-force attacks on login endpoints.
- Credential stuffing at scale.
- API abuse and scraping without hitting rate limits.
- Denial-of-service by generating unlimited requests.

### Recommended fix
Only trust `X-Forwarded-For` / `X-Real-IP` when the request originates from a
known trusted proxy IP (configured via an allowlist env var). In environments
where the app is directly exposed (no proxy), always use the socket remote
address. Cloudflare's `CF-Connecting-IP` is already the first choice and is
trusted when behind Cloudflare.

---

## F-008 — OFAC sanctions screening fails open when API is unavailable

- **ID:** F-008
- **Severity:** Critical
- **Confidence:** High
- **File:** `src/lib/compliance/ofac.ts`
- **Line numbers:** 22–45, 72, 98

### Evidence
`ofacSearch` (line 22) catches all errors and returns `null` on failure:

```
} catch (err) {
  logger.warn("[ofac] API unavailable", { err: String(err) });
  return null;
}
```

`screenUser` (line 72) and `screenAddress` (line 98) both treat `null` as
"no sanctions hit":

```
if (!result) return { ...noHit, screenedAt: new Date() };
```

When the OFAC API is unreachable (network issue, rate limit, service outage),
the screening silently returns `matched: false`, allowing a blocked user or
address to pass through the compliance gate.

### Root cause
The sanctions screening is designed for graceful degradation when the external
provider is unavailable, but compliance screening has a fundamentally different
risk profile from other external dependencies. A sanctions miss is not a
performance degradation — it is a regulatory violation that can result in
severe penalties (OFAC fines, criminal liability, exchange license revocation).

### Production impact
If the OFAC API is down, the system processes withdrawals and user operations
as if no sanctions match exist. This exposes the platform to:
- OFAC violations (processing transactions involving sanctioned entities).
- Regulatory penalties and criminal liability.
- Reputational damage and potential loss of banking relationships.

### Recommended fix
Change the default to fail-closed: when the OFAC API is unavailable, the
screening should return `matched: true` (treat as a potential hit requiring
manual review) or throw an error that blocks the withdrawal. Add a circuit
breaker that tracks consecutive failures and automatically blocks all
withdrawals after N consecutive API failures. The `OfacSanctionsProvider`
should implement a local fallback list (SDN addresses and names cached
periodically) for use when the API is unavailable.

---

## F-009 — Withdrawal velocity check has a TOCTOU race condition

- **ID:** F-009
- **Severity:** High
- **Confidence:** High
- **File:** `src/lib/security/withdraw-gate.ts`
- **Line numbers:** 44–62

### Evidence
`checkWithdrawVelocity` (line 32) performs a read-then-write on the user's
withdrawal volume counter:

```
const currentStr = results?[0]?[1];
const current = typeof currentStr === "string" ? parseFloat(currentStr) : 0;

if (current + amountUsd > limitUsd) {
  return { allowed: false, remaining, reason: "daily_limit_exceeded" };
}

await r.incrbyfloat(key, amountUsd);
```

The check and the increment are two separate Redis commands with no atomic
guard. Between the check and the increment, another concurrent request can
also pass the check and increment the counter, causing the total to exceed
`limitUsd` by the sum of all concurrent requests.

### Root cause
Classic Time-Of-Check to Time-Of-Use (TOCTOU) race condition. The velocity
check is not atomic with the increment.

### Production impact
An attacker with multiple concurrent withdrawal requests (or a user making
many simultaneous withdrawals) can exceed the daily USD withdrawal limit.
The limit is a financial risk control — exceeding it exposes the platform
to larger losses if the accounts are fraudulent. On a crypto exchange, this
could enable a bad actor to withdraw more than the platform's per-user daily
limit before the system detects the anomaly.

### Recommended fix
Use a Lua script to perform the check and increment atomically in a single
Redis command. The Lua script should return a result indicating whether the
operation is allowed, and the caller should act on that result. Alternatively,
use Redis `WATCH`/`MULTI`/`EXEC` transaction with a retry loop.

---
