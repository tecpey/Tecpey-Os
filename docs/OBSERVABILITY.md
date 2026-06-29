# TecPey Observability Guide

Phase 26 — Production Observability & Operations Foundation

---

## Overview

TecPey uses a structured, JSON-first observability stack built entirely on Node.js primitives — no heavy SDK dependencies. All logs are emitted as newline-delimited JSON (NDJSON), compatible with Datadog, BetterStack/Logtail, Grafana Loki, and any log aggregator that accepts structured input.

---

## Logging Format

Every log entry is a single JSON object on one line:

```json
{
  "ts": "2026-06-30T10:00:00.000Z",
  "level": "info",
  "service": "tecpey-web",
  "environment": "production",
  "msg": "[api] request",
  "requestId": "a3f7c2d1-...",
  "route": "/api/academy/mentor-memory",
  "method": "GET",
  "status": 200,
  "latencyMs": 42
}
```

**Standard fields:**

| Field | Always present | Description |
|---|---|---|
| `ts` | Yes | ISO-8601 UTC timestamp |
| `level` | Yes | `debug` \| `info` \| `warn` \| `error` |
| `service` | Yes | Always `"tecpey-web"` |
| `environment` | Yes | `"production"` \| `"development"` |
| `msg` | Yes | Human-readable message prefix |

**Optional context fields:**

| Field | When present |
|---|---|
| `requestId` | Set by `withObservability` or when request ID is propagated |
| `traceId` | Future — distributed trace correlation (OpenTelemetry) |
| `tenantId` | Multi-tenant context; currently always `"tecpey"` |
| `workspaceId` | Workspace context; currently always `"main"` |
| `userId` | The user performing the action |
| `route` | API route path |
| `method` | HTTP method |
| `status` | HTTP response status code |
| `latencyMs` | Handler wall-clock time in milliseconds |
| `errorCode` | Machine-readable error code from `apiError()` |
| `errorMessage` | Error message (server errors only) |
| `errorName` | Error class name |

---

## Request ID

Every request gets a unique UUID (`x-request-id`).

**Page requests (via proxy):**
- The proxy middleware (`src/proxy.ts`) generates a `requestId` per page load.
- Sets `x-tecpey-request-id` on the forwarded request headers.
- Sets `x-request-id` on the response — visible to clients in browser DevTools.

**API requests:**
- `getRequestId(req)` from `src/lib/trace.ts` extracts `x-tecpey-request-id` if set,
  otherwise generates a new UUID.
- `withObservability()` calls this automatically and attaches `x-request-id` to responses.

**Using request ID in a handler:**
```typescript
import { getRequestId } from "@/lib/trace";
import { withObservability } from "@/lib/observe";

export async function GET(req: NextRequest) {
  return withObservability(req, { route: "/api/example" }, async () => {
    const requestId = getRequestId(req);
    const log = logger.child({ requestId, route: "/api/example" });
    log.info("handling request");
    // ...
  });
}
```

**Trace debugging steps:**
1. Find the `x-request-id` in the browser response headers (DevTools → Network → Response Headers).
2. Search logs: `grep '"requestId":"<id>"' <log-stream>` to find all log entries for that request.
3. The full log chain (auth check, DB query, response) will share the same `requestId`.

---

## Child Logger

Use `logger.child(context)` to bind reusable fields rather than repeating them on every call:

```typescript
import { logger } from "@/lib/logger";

const log = logger.child({ requestId, tenantId: "tecpey", route: "/api/foo" });
log.info("processing");   // requestId, tenantId, route are included automatically
log.error("failed", { errorCode: "db_error" });
```

---

## API Observability Wrapper

`withObservability()` from `src/lib/observe.ts` instruments a handler with:
- Request ID extraction and `x-request-id` response header
- Structured log on completion (method, status, latencyMs)
- In-memory metrics recording
- Error capture via `captureError()`

```typescript
import { withObservability } from "@/lib/observe";

export async function POST(req: NextRequest) {
  return withObservability(req, { route: "/api/my-route" }, async () => {
    // existing handler body unchanged
  });
}
```

The wrapper does not alter response bodies or status codes.

---

## Health Endpoint

`GET /api/health` — no authentication required.

**Full response schema:**

```json
{
  "ok": true,
  "health": "ok | degraded",
  "service": "tecpey-web",
  "environment": "production",
  "timestamp": "2026-06-30T10:00:00.000Z",
  "healthCheckLatencyMs": 35,
  "uptime": { "seconds": 3600 },
  "build": {
    "version": "0.26.0",
    "commit": "6313837",
    "node": "v22.14.0"
  },
  "memory": {
    "rss": 120,
    "heapUsed": 65,
    "heapTotal": 90,
    "external": 5
  },
  "checks": {
    "app": "ok",
    "database": "ok | unavailable | unconfigured",
    "redis": "ok | unavailable | unconfigured",
    "email": "configured | unconfigured"
  },
  "latency": {
    "databaseMs": 8,
    "redisMs": 12
  },
  "migrations": {
    "applied": 3,
    "status": "tracked | unknown"
  },
  "tenantSystem": {
    "status": "available | unavailable",
    "mode": "single-tenant",
    "defaultTenantId": "tecpey"
  },
  "featureFlags": {
    "academy.enabled": true,
    "exchange.enabled": true,
    "social.enabled": false,
    "mentor.enabled": true,
    "future.marketplace.enabled": false
  },
  "observability": {
    "errorTracking": "configured | unconfigured",
    "alertWebhook": "configured | unconfigured"
  },
  "warnings": [
    "redis_not_configured: rate limiting is per-instance only"
  ]
}
```

**Status codes:**
- `200` always — callers must read `health` field, not the HTTP status.
- `"ok"`: all critical checks passed.
- `"degraded"`: database or Redis is unavailable (non-critical services missing do not degrade).

---

## Metrics Endpoint

`GET /api/admin/metrics` — requires `x-tecpey-admin-token` header or admin session cookie.

Returns an in-memory snapshot of:
- `totalRequests` / `totalErrors` / `errorRate`
- Per-route request counts and average latency
- Per-route error breakdown by status code
- Named counters (auth failures, etc.)

**Note:** Metrics are per-process and reset on restart. For persistent metrics, forward log entries to a TSDB (Grafana/InfluxDB) or use the BetterStack integration.

---

## Error Tracking

`captureError(error, context?)` from `src/lib/error-tracking.ts`.

Controlled by `ERROR_TRACKING_PROVIDER` env var:

| Provider | Config | Behavior |
|---|---|---|
| `none` (default) | — | Structured `error` log only |
| `betterstack` | `BETTERSTACK_SOURCE_TOKEN` | POST to Logtail ingest via `fetch` |
| `sentry` | `NEXT_PUBLIC_SENTRY_DSN` + `@sentry/nextjs` | Stub — add package then uncomment |

The `captureError` call never throws and never blocks the response.

---

## Alerting

`emitAlert(type, message, extra?)` from `src/lib/alerts.ts`.

**Alert types and severity:**

| Type | Severity | Trigger |
|---|---|---|
| `DB_DOWN` | critical | Database health check fails |
| `REDIS_DOWN` | warning | Redis health check fails |
| `EMAIL_NOT_CONFIGURED` | warning | `EMAIL_PROVIDER` not set in production |
| `EMAIL_SEND_FAILED` | warning | `sendEmail()` returns `{ ok: false }` |
| `API_ERROR_SPIKE` | critical | Unusual error rate detected |
| `PRICE_FEED_DOWN` | warning | Exchange price WebSocket unresponsive |
| `MIGRATION_FAILED` | critical | `runMigrations()` throws |

**Delivery:**
1. Logged as structured JSON at `error` (critical) or `warn` (warning) level.
2. If `ALERT_WEBHOOK_URL` is set: POST JSON payload to that URL (non-blocking).
3. Deduplicated: same alert type will not fire again within 60 seconds.

**Connect Slack:** Set `ALERT_WEBHOOK_URL` to a Slack Incoming Webhook URL. The payload is standard JSON; Slack accepts it natively.

**Connect PagerDuty:** Set `ALERT_WEBHOOK_URL` to a PagerDuty Events API v2 endpoint or route through a relay that transforms the payload.

---

## Recommended Production Stack

| Layer | Recommended tool | Why |
|---|---|---|
| Log aggregation | BetterStack / Logtail | NDJSON ingest, search, alerting; no agent needed |
| Error tracking | BetterStack or Sentry | BetterStack: zero extra package (fetch-based). Sentry: richer stack traces |
| Metrics / dashboards | Grafana + InfluxDB or Datadog | Forward structured logs via log processor |
| Alerting relay | Slack Incoming Webhook | Connect `ALERT_WEBHOOK_URL` directly |
| Uptime monitoring | Better Uptime / UptimeRobot | Poll `/api/health` every 60 s |
| Distributed tracing | OpenTelemetry (future) | Add `@opentelemetry/sdk-node` when ready; `requestId` propagation is the foundation |

---

## Metrics Plan (Future)

Phase 26 provides in-memory metrics. To scale:

1. **Short term:** Forward structured API logs (`"[api] request"` entries) to BetterStack. Use their metrics view to chart latency and error rate by route.
2. **Medium term:** Add a `/metrics` Prometheus endpoint (protected) exposing counters in Prometheus text format.
3. **Long term:** OpenTelemetry SDK integration — export traces, metrics, and logs to any OTLP-compatible backend.

---

## Alerting Plan (Future)

1. Add `emitAlert("API_ERROR_SPIKE", ...)` call inside a periodic aggregation job that checks the in-memory metrics error rate.
2. Add `emitAlert("PRICE_FEED_DOWN", ...)` inside the WebSocket reconnect handler in `LivePriceChart`.
3. Add `emitAlert("MIGRATION_FAILED", ...)` inside the migration runner catch block.
4. Add email delivery for critical alerts using `sendEmail()` from `email.ts` as the webhook relay.
