# TecPey Operations Runbook

Last updated: Phase 26 — Production Observability & Operations Foundation

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
| `NEXT_PUBLIC_GIT_COMMIT` | Recommended | Git SHA injected at build time |
| `NEXT_PUBLIC_BUILD_VERSION` | Recommended | Semver/build number |
| `ERROR_TRACKING_PROVIDER` | Recommended | `betterstack` or `sentry` |
| `ALERT_WEBHOOK_URL` | Recommended | Slack/PagerDuty webhook for critical alerts |

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
- [ ] Build version set (`NEXT_PUBLIC_GIT_COMMIT`, `NEXT_PUBLIC_BUILD_VERSION`)
- [ ] Admin panel accessible: `GET /api/admin/metrics` returns 200 with token
- [ ] Rate limiting cross-instance: Redis mode confirmed via `"mode": "redis"` in rate-limit logs

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
