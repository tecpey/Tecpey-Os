# TecPey Operations Runbook

Last updated: 2026-08-09 — Controlled Launch Incident Readiness

This runbook covers the most common production incidents and how to diagnose and resolve them.

---

## Environment Variable Checklist

Before any production deployment, verify:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `TECPEY_SESSION_SECRET` | **Yes** | JWT signing secret (min 64 chars) |
| `TECPEY_ACADEMY_AUTH_SECRET` | **Yes** | Academy JWT secret |
| `CERTIFICATE_SIGNING_SECRET` | **Yes** | Certificate signing secret |
| `UPSTASH_REDIS_REST_URL` | **Yes** | Redis for cross-instance rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | **Yes** | Redis auth token |
| `NEXT_PUBLIC_SITE_URL` | **Yes** | Canonical HTTPS site URL |
| `TECPEY_ADMIN_TOKEN` | **Yes** | Admin panel access token |
| `EMAIL_PROVIDER` | Recommended | `resend` or `sendgrid` for email delivery |
| `RESEND_API_KEY` | If `EMAIL_PROVIDER=resend` | Resend.com API key |
| `TECPEY_BUILD_COMMIT_SHA` | **Build only** | Exact Git SHA baked into the compiled artifact; never set through runtime EnvironmentFile |
| `NEXT_PUBLIC_BUILD_VERSION` | Recommended | Semver/build number |
| `ERROR_TRACKING_PROVIDER` | Recommended | `betterstack` or `sentry` |
| `ALERT_WEBHOOK_URL` | Recommended | Legacy application alert webhook for health alerts |
| `TECPEY_OPS_ALERT_WEBHOOK_URL` | **Controlled launch required** | Approved ops alert webhook used by staging scheduler and alert delivery drills |

Quick check command:
```bash
curl -s https://tecpey.ir/api/health | jq '.checks, .warnings'
```

---

## Production Launch Checklist

- [ ] All required env vars set (see table above)
- [ ] `DATABASE_URL` points to production database (not CHANGE_ME placeholder)
- [ ] Redis configured — `/api/health` shows `"redis": "ok"`
- [ ] Database reachable — `/api/health` shows `"database": "ok"`
- [ ] Migrations applied — health shows `"migrations.applied"` > 0
- [ ] `EMAIL_PROVIDER` set and tested with a real address
- [ ] `TECPEY_ADMIN_TOKEN` is at least 32 characters, randomly generated
- [ ] `NEXT_PUBLIC_SITE_URL` is `https://` (triggers `Secure` cookie flag)
- [ ] CSP headers present — check `Content-Security-Policy` in response
- [ ] `X-Frame-Options: DENY` in response headers
- [ ] Error tracking configured (`ERROR_TRACKING_PROVIDER=betterstack` or `sentry`)
- [ ] Alert webhook configured (`ALERT_WEBHOOK_URL`)
- [ ] Ops alert webhook configured and probe-tested (`TECPEY_OPS_ALERT_WEBHOOK_URL`)
- [ ] Immutable build commit is baked by the governed build (`TECPEY_BUILD_COMMIT_SHA`)
- [ ] Admin panel accessible: `GET /api/admin/metrics` returns 200 with token
- [ ] Rate limiting cross-instance: Redis mode confirmed via `"mode": "redis"` in rate-limit logs

## Controlled Launch Incident Coverage

Controlled-launch support is 09:00-23:00 Asia/Tehran daily. P0 incidents must
be acknowledged within 15 minutes during support hours and within 60 minutes
outside support hours. P1 incidents must be acknowledged within 4 hours.

Before any Go decision, attach the evidence required by
[`INCIDENT_READINESS_CONTRACT.md`](./operations/INCIDENT_READINESS_CONTRACT.md):
two successful protected-staging critical alert probes, zero pending alerts,
zero quarantined alerts, acknowledgement drill evidence, and named owners for
DB, Redis, migration, alert delivery, worker and reconciliation failures.

---

## Incident: Database Down

**Symptom:** `/api/health` returns `"database": "unavailable"`. `DB_DOWN` alert emitted.
Academy features, notifications, leaderboards, and certificates return 503.

**Diagnosis:**
```bash
# Check health
curl https://tecpey.ir/api/health | jq '.checks.database, .latency.databaseMs'

# Check PostgreSQL connectivity from server
psql "$DATABASE_URL" -c "SELECT 1"

# Check pool errors in logs
grep '"\\[db\\]"' <log-stream>
```

**Resolution:**
1. If PostgreSQL is down: restart the database service or failover to replica.
2. If connection string is wrong: update `DATABASE_URL` env var and redeploy.
3. If pool is exhausted: check for connection leaks; `max: 10` is the pool ceiling.
4. Once DB is back, the pool reconnects automatically — no redeploy needed.

**Rollback:** App continues to serve pages and static content. Academy features degrade gracefully via `withDb` → `{ enabled: false }` fallback.

---

## Incident: Redis Down

**Symptom:** `/api/health` returns `"redis": "unavailable"`. `REDIS_DOWN` alert emitted.
Rate limiting falls back to per-instance in-memory mode.

**Diagnosis:**
```bash
curl https://tecpey.ir/api/health | jq '.checks.redis, .latency.redisMs'
grep 'REDIS_DOWN\|rate-limit.*Redis' <log-stream>
```

**Resolution:**
1. Check Upstash dashboard for quota/outage.
2. Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set correctly.
3. In-memory fallback is active — rate limits work but do not coordinate across instances.
4. For sustained Redis outage, consider deploying with a single instance to preserve rate-limit correctness.

---

## Incident: Email Provider Missing

**Symptom:** `/api/health` warnings include `email_not_configured`. Emails are not delivered.
`EMAIL_NOT_CONFIGURED` alert emitted once per hour (dedup window).

**Diagnosis:**
```bash
curl https://tecpey.ir/api/health | jq '.checks.email, .warnings'
echo $EMAIL_PROVIDER $RESEND_API_KEY
```

**Resolution:**
1. Set `EMAIL_PROVIDER=resend` and `RESEND_API_KEY=<key>` in production env.
2. Redeploy — the setting takes effect on the next process start.
3. Test: trigger an email action (e.g. certificate delivery) and check Resend dashboard.

---

## Incident: Alert delivery failure

**Symptom:** Synthetic P0 probe does not arrive in the approved operator channel
within five minutes, or pending/quarantine counts are non-zero.

**Diagnosis:**
```bash
npm run ops:alerts:deliver
npm run ops:staging:evidence:verify -- <redacted-evidence.json>
```

**Resolution:**
1. Freeze launch expansion and assign the incident commander.
2. Verify `TECPEY_OPS_ALERT_WEBHOOK_URL` is present in the protected
   environment without exposing the value.
3. Re-run two synthetic critical probes and preserve counts, hashes and timing
   only.
4. Keep NOG-07 open until the evidence passes
   `scripts/verify-incident-readiness-evidence.mjs`.

---

## Incident: Migration Failure

**Symptom:** `DB_DOWN` or `MIGRATION_FAILED` alert. App starts but DB operations fail.
`/api/health` shows `"migrations.status": "unknown"` or connection errors.
Server logs contain `[db-migrate]` error entries.

**Diagnosis:**
```bash
# Check migration log
grep 'db-migrate\|migration' <log-stream>

# Check applied migrations manually
psql "$DATABASE_URL" -c "SELECT filename, applied_at FROM _migrations ORDER BY applied_at"
```

**Resolution:**
1. Connect to the DB and inspect `_migrations` for partial state.
2. If a migration applied partially: manually revert the partial changes and delete the `_migrations` row, then redeploy.
3. If a checksum mismatch: the migration file was edited after being applied. Restore the original content or create a new corrective migration.
4. Never delete `_migrations` rows without reverting the schema change they represent.

---

## Incident: Provider failure

**Symptom:** A configured external provider for email, market data, AI Mentor,
alert delivery or CRM rejects requests, times out, or produces ambiguous
results.

**Diagnosis:**
```bash
curl https://tecpey.ir/api/health | jq '.checks, .warnings'
grep 'provider\|timeout\|ambiguous' <log-stream>
```

**Resolution:**
1. Degrade or pause the affected feature; do not enable real-money flows as a
   workaround.
2. Record provider name as a category only, not raw payloads or credentials.
3. Open an incident if user-visible Academy, Mentor, Arena or alert delivery is
   affected.
4. User communication owner records the controlled-launch status update.

---

## Incident: High API Error Rate

**Symptom:** Error rate spike visible in `/api/admin/metrics`. `API_ERROR_SPIKE` alert.
Users reporting 500 or 503 responses.

**Diagnosis:**
```bash
# Check metrics (requires admin token)
curl -H "x-tecpey-admin-token: $TECPEY_ADMIN_TOKEN" \
  https://tecpey.ir/api/admin/metrics | jq '.metrics.routes.errors'

# Check error logs
grep '"level":"error"' <log-stream> | tail -50 | jq '.msg, .route, .errorMessage'
```

**Resolution:**
1. Check the top error routes in metrics.
2. If DB-related: check DB health first.
3. If auth-related: check `TECPEY_SESSION_SECRET` is still set.
4. If rate-limit errors: check Redis status; rate limits may be tighter under single-instance fallback.
5. Deploy a fix or rollback (see Deployment Rollback section).

---

## Incident: Worker failure

**Symptom:** Scheduled jobs, notification delivery, challenge finalization,
community jobs or reconciliation workers stop, retry indefinitely, or quarantine
events grow.

**Diagnosis:**
```bash
npm run ops:scheduler:check
npm run notifications:runtime:check
grep 'worker\|queue\|quarantine' <log-stream>
```

**Resolution:**
1. Pause expansion and identify the owning worker.
2. Drain safe retries only after idempotency and tenant/principal boundaries are
   confirmed.
3. Preserve counts and digests only; never attach raw jobs or user payloads.
4. Re-run the relevant authority guard before resuming the controlled cohort.

---

## Incident: Reconciliation failure

**Symptom:** Academy progress, Arena state, Mentor memory, Exchange ledger,
notifications/jobs, tenant/principal isolation or audit trails fail domain
reconciliation after restore or rollback.

**Diagnosis:**
```bash
npm run ops:recovery:check
npm run ops:recovery:protected-evidence:verify -- <artifact.json> --expected-sha <candidate-sha>
```

**Resolution:**
1. Keep NOG-05 open and freeze launch expansion.
2. Assign domain owner and independent reviewer.
3. Re-run reconciliation with counts and hashes only.
4. Do not accept the incident as closed until halt/rollback and
   user-communication ownership are recorded.

---

## Incident: Price Feed Down

**Symptom:** Exchange/markets page shows stale or missing prices. `PRICE_FEED_DOWN` alert.
`NEXT_PUBLIC_API_SOCKET_URL` WebSocket may be timing out.

**Diagnosis:**
```bash
# Check WebSocket URL is reachable
wscat -c "$NEXT_PUBLIC_API_SOCKET_URL" 2>&1 | head -5

# Check backend API
curl "$NEXT_PUBLIC_API_BACKEND_URL/health" 2>&1
```

**Resolution:**
1. If backend market feed is down: contact the backend team.
2. UI degrades gracefully — pages render with last-known prices or empty state.
3. No server restart needed unless the URL itself has changed.

---

## Incident: GitHub Actions Failure

**Symptom:** CI pipeline fails on push. Deployment blocked.

**Diagnosis:**
- Check the Actions tab on the repository.
- Common causes: typecheck failure, lint error, build error.

**Local reproduction:**
```bash
npm run typecheck
npm run lint
npm run build
```

**Resolution:**
1. Fix the failing check locally and push a corrective commit.
2. Never skip CI with `--no-verify` without approval.

---

## Deployment Rollback

**When to roll back:** Health endpoint shows `"health": "degraded"` after deploy and fix is not immediate.

**Procedure (Vercel / serverless):**
```bash
# List recent deployments
vercel ls --prod

# Roll back to previous
vercel rollback <deployment-url> --prod
```

**Procedure (self-hosted Docker):**
```bash
# Tag the last known-good image before deploying
docker tag tecpey:latest tecpey:rollback-$(date +%Y%m%d)

# Rollback
docker service update --image tecpey:rollback-YYYYMMDD tecpey-web
```

After rollback:
1. Confirm `/api/health` returns `"health": "ok"`.
2. Check admin metrics for error rate returning to baseline.
3. Investigate root cause before re-deploying the broken version.

---

## Useful Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | None | Enterprise health check |
| `GET /api/admin/metrics` | Admin token | In-memory metrics snapshot |
| `GET /api/academy-auth` | Session cookie | Academy auth status |

Health check response fields: see `docs/OBSERVABILITY.md`.
