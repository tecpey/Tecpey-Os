---
name: performance
description: Performance optimization for TecPey — Next.js 16, App Router, API latency, DB queries, bundle size, and trading-surface real-time data. Adapted from addyosmani/agent-skills performance-optimization (MIT).
---

# Performance Skill — TecPey

**Source:** github.com/addyosmani/agent-skills (performance-optimization)
**License:** MIT
**Adoption:** Adopted — adapted for TecPey's Next.js 16 + App Router + trading domain
**Audit date:** 2026-06-30

---

## Measure Before Optimizing

Never optimize without a measurement baseline.

For API routes:
```typescript
const start = Date.now();
// ... handler body ...
const latencyMs = Date.now() - start;
logger.info("[route] completed", { latencyMs });
```

`withObservability()` already captures latency per route — check the structured
logs before assuming a route is slow.

---

## API Route Performance

### Query efficiency

- Always add `LIMIT` to list queries — never unbounded DB reads
- Prefer indexes over full table scans — new list queries should confirm indexes exist
- Use `beforeId` cursor pagination on high-volume tables (`wallet_ledger`, `orders`, `trades`)
- Avoid N+1: don't query inside a loop; use JOINs or batch lookups

### Response size

- Cap list responses at a documented maximum (50–200 rows depending on endpoint)
- Strip internal fields from API responses (never return `_migration_hash`, internal IDs)
- Use `JSON.stringify` only on the final response shape, not intermediate objects

---

## Next.js 16 App Router

- `export const dynamic = "force-dynamic"` — required on all API routes that
  read session, DB, or request state
- Avoid `export const revalidate = 0` on non-API routes unless explicitly needed
- Static pages (landing, marketing) should use static generation where possible
- Server Components vs. Client Components: default to Server; add `"use client"` only
  when interactivity requires it

---

## Bundle Size

- Never import an entire library for one utility (`lodash`, `date-fns`, etc.)
- Tree-shakeable imports only: `import { formatISO } from "date-fns"` not `import df from "date-fns"`
- `next/dynamic` with `ssr: false` for heavy client-only components (TradingViewChart, etc.)
- Check bundle impact before adding any new dependency: `npm run build` shows route sizes

---

## Trading Surface Performance

Order book and price data are latency-critical:

- `GET /api/orderbook` — rate limited at 480/min; clients should poll at ≤ 1Hz
- Order book reads hit the in-memory `globalThis.tecpeyOrderBooks` — no DB read
- Future WebSocket upgrade should be gated on a Phase decision, not added ad-hoc
- Never render raw order book data in a React component without virtualizing rows
  (use `react-virtual` or a windowing library when > 20 rows)

---

## Image and Asset Performance

- All images use `next/image` with explicit `width` and `height`
- The TP logo is served as SVG or optimized PNG — never as base64 in JSX
- No unoptimized `<img>` tags in committed code

---

## Database (Postgres via withDb)

- Always check `result.enabled` before using `result.value`
- Use connection pooling (PgBouncer or Vercel Postgres pooled URL in production)
- Index coverage: confirm with `EXPLAIN ANALYZE` for any query on tables > 10k rows
- Migrations are append-only — never `ALTER TABLE ... DROP COLUMN` without a migration

---

## Observability-Driven Performance

`withObservability()` tracks:
- `latencyMs` per request
- Error rate per route window (spike detection at 50 req/min + 40% error rate)

Use these signals to identify hot spots before optimizing:
- High latency → check DB query plan or missing index
- High error rate → check rate limit settings, auth failure pattern, or downstream dep
