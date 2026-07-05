# Master Blueprint v3.0 — TecPey Platform Architecture

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Official — supersedes `PLATFORM_BLUEPRINT_v2.md` and `docs/Architecture.md`
**Version:** 3.0

---

## 1. Purpose

This document defines the target architecture of the TecPey platform. Current state deviations are noted with `[CURRENT STATE]` markers. Sections without such markers describe the target.

Architecture decisions are permanent unless explicitly revised by a new blueprint version. Every architectural choice in this document has a rationale.

---

## 2. Identity Model

### 2.1 Core Entities (Target)

```
User
├── id: UUID (PK)
├── email: string (unique, verified)
├── emailVerifiedAt: timestamp | null
├── createdAt: timestamp
├── locale: string (default: "fa-IR")
└── TenantMemberships[]: TenantMembership[]

TenantMembership
├── userId: UUID (FK → User)
├── tenantId: UUID (FK → Tenant)
├── role: TenantRole
└── joinedAt: timestamp

TenantRole (enum)
└── superadmin | admin | instructor | student | viewer | api_client

Tenant
├── id: UUID (PK)
├── slug: string (unique, URL-safe)
├── displayName: string
├── plan: TenantPlan (free | pro | enterprise | white_label)
├── config: TenantConfig (JSONB)
├── domain: string | null
└── createdAt: timestamp

TenantConfig
├── aiModel: string
├── rateLimits: Record<string, number>
├── features: FeatureFlags
├── branding: BrandingConfig
└── locales: string[]
```

**[CURRENT STATE]** No tenant model. Three separate auth tables (`academy_auth_accounts`, `academy_students`, implicit market user). No role hierarchy. Three cookies for authentication.

### 2.2 JWT Design (Target)

```json
{
  "sub": "user-uuid",
  "email": "student@example.com",
  "tenant": "default",
  "roles": ["student"],
  "scopes": ["read:progress", "write:journal", "read:mentor"],
  "iat": 1700000000,
  "exp": 1700086400,
  "jti": "unique-token-id"
}
```

Single cookie: `tp_session` (httpOnly, secure, sameSite: lax). 8-hour expiry. Refresh via `/api/v1/auth/refresh`.

**[CURRENT STATE]** Three cookies (`user_session`, `tecpey_academy_auth`, `tecpey_student_session`). Admin token in sessionStorage. No unified JWT. Phase target: Phase 21.

### 2.3 Migration Path

1. Phase 20: Engineering foundation (migration runner, validation, logging)
2. Phase 21: Unified identity model, API versioning
3. Session migration: legacy cookie readers remain for 30 days, then removed

---

## 3. Tenant Architecture

### 3.1 Tenant Resolution (Target)

```
Request arrives
    ↓
Middleware resolves Tenant (priority order):
1. Custom domain → lookup by domain
2. Subdomain → lookup by slug
3. X-Tenant-ID header (API clients) → lookup by id
4. Default → default tenant
    ↓
TenantContext → all DB queries use tenant_id
```

**[CURRENT STATE]** No tenant resolution. Phase target: Phase 23.

### 3.2 Data Isolation

- **Current target:** Row-level isolation via `tenant_id` column
- **Future option (Phase 23+):** Schema-per-tenant for white-label deployments
- **[CURRENT STATE]** No tenant_id on any table

**See [[WHITE_LABEL_PLATFORM.md]] for complete white-label architecture — Permanent White-Label Architecture.**

---

## 4. Current Architecture (as of Phase 39.5)

```
Nginx → Custom Server (server.ts, port 3000) → Next.js 16 App Router
                                                    ↓
           ┌──────────────────────────────────────────────────────────────┐
           │  src/app/                                                    │
           │  ├── (root) fa-IR RTL pages                                  │
           │  ├── en/ en-US LTR pages                                     │
           │  ├── academy/ 7-term education platform                      │
           │  ├── api/ ~73 API route handlers                             │
           │  └── layout.tsx Root RTL layout + EnglishShell wrapper       │
           └──────────────────────────────────────────────────────────────┘
                                                    ↓
           ┌──────────────────────────────────────────────────────────────┐
           │  Infrastructure                                               │
           │  ├── PostgreSQL (schema-on-connect)                           │
           │  ├── Redis (BullMQ, pub/sub, rate limiting)                   │
           │  ├── WebSocket Server (ws, /ws path)                          │
           │  └── Withdrawal Workers (BullMQ)                              │
           └──────────────────────────────────────────────────────────────┘
```

### Server Architecture

- Custom `server.ts` starts Next.js, WebSocket server, Redis pub/sub, compliance providers, and withdrawal workers
- PM2 config (`ecosystem.config.cjs`) correctly targets `server.ts` via `tsx`
- Docker CMD uses `npm run start` which runs `tsx server.ts`
- Systemd uses `npm run start`
- **PM2 path is aligned with custom server in current config**

---

## 5. Module Map

| Module | Current Location | Status | Target Phase |
|--------|-----------------|--------|-------------|
| Identity & Auth | `src/lib/academy-auth.ts`, `session.ts`, `auth-session.ts` | Needs redesign | Phase 21 |
| Academy Curriculum | `src/data/academy/` | Needs CMS | Phase 28 |
| Student Progress | `src/lib/academy-progress.ts` (localStorage) | Needs server migration | Phase 22 |
| Behavioral Engine | `src/lib/behavioral-engine.ts` (localStorage) | Needs server migration | Phase 22 |
| Trading DNA | `src/lib/trading-dna.ts` (localStorage) | Needs server migration | Phase 22 |
| Trading Arena | `src/lib/trading-arena.ts` (localStorage) | Needs server migration | Phase 22 |
| Trading Journal | `src/lib/trading-journal.ts` (localStorage) | Needs server migration | Phase 22 |
| Mentor AI | `src/app/api/ai-mentor*/` | Functional | Phase 25 |
| Certificates | `src/lib/academy-certificates.ts` | ✅ Server-side | — |
| Achievements | `src/lib/phase5-achievement-engine.ts` | ✅ Server-side | — |
| Community | `src/lib/community-*.ts` | Mixed (localStorage + DB) | Phase 22 |
| Notifications | `src/app/api/notifications/` | ✅ Server-side | — |
| Wallet | `src/lib/wallet/**` | ✅ Phase 38 (hot wallet), Phase 39 stubs | Phase 39+ |
| Trading Engine | `src/lib/trading/**` | Functional | — |
| SEO/GEO | `src/lib/seo.ts`, `src/lib/entity.ts` | ✅ | — |

---

## 6. API Architecture (Target)

### 6.1 Versioning

```
/api/v1/
├── auth/        — login, logout, register, me, refresh, verify-email
├── students/    — progress, export, dna
├── academy/     — terms, lessons, progress
├── mentor/      — ask, conversations, insights, memory
├── trading/     — arena, journal, scenarios
├── community/   — profile, leaderboard, challenges, groups
├── trust/       — verify/{id}
└── admin/       — tenants, students, analytics
```

**[CURRENT STATE]** No version prefix. Routes directly under `/api/`. Phase target: Phase 21.

### 6.2 Error Contract (Target)

```json
{
  "ok": false,
  "code": "AUTH_EXPIRED",
  "message": "Human-readable description",
  "details": {}
}
```

**[CURRENT STATE]** Inconsistent error format across different API handlers.

### 6.3 Pagination (Target)

All list endpoints: cursor-based pagination with `?cursor=<opaque>&limit=20`. Response includes `data`, `nextCursor`, `hasMore`.

---

## 7. Database Architecture

### 7.1 Current (Phase 39.5)

- **Pattern:** Schema-on-connect (`CREATE TABLE IF NOT EXISTS` in `db-schema.ts`)
- **Migration:** Single reference SQL file (`migrations/0001_initial_schema.sql`) — not executed by runner
- **Migration runner:** Not implemented — planned for Phase 22

### 7.2 Target

```
migrations/
├── 0001_init_identity.sql
├── 0002_init_tenant.sql
├── 0003_... (applied via migration runner)

_migrations table: { id, filename, applied_at, checksum }
```

---

## 8. AI Architecture

**See [[AI_PLATFORM.md]] for the complete AI architecture definition — Permanent AI Constitution.**

### 8.1 AI Model (Target)

All AI routes through a unified service:
```typescript
interface AIModel {
  ask(params: {
    tenantId: string; userId: string;
    domain: "mentor" | "support" | "admin" | "trading";
    messages: Message[]; context: AIContext;
    promptVersion?: string;
  }): Promise<AIResponse>;
}
```

### 8.2 Current

- AI Mentor uses OpenAI Responses API directly
- No unified AI model service
- No prompt registry
- No A/B testing
- Phase target: Phase 25

### 8.3 AI Platform Scope (See AI_PLATFORM.md)

**See [[AI_PLATFORM.md]] — Permanent AI Constitution.**

The AI_PLATFORM.md document defines the complete AI ecosystem:

- **TecPey AI (Core Brain)** — Central orchestration and agent routing
- **Mentor AI** — Educational AI coach (Production since Phase 16)
- **Trading AI** — Market analysis and risk assessment (Phase 49)
- **Admin AI** — Operations and compliance assistant (Phase 49)
- **Executive AI** — Strategic decision support (Phase 49)
- **C-Level AI Agents** — CTO, CPO, CMO, CFO, CRO specialized agents (Phase 49)
- **Marketplace AI** — Recommendations, moderation, quality scoring (Phase 48)
- **White-label AI** — Per-tenant AI customization (Phase 44 + 49)
- **Customer AI** — Support automation and ticket triage (Phase 49)
- **Internal AI** — Engineering productivity tools (Phase 45+)

**Shared Infrastructure:**
- AI Gateway — Unified entry point with auth, rate limiting, cost control
- Model Router — OpenAI, Anthropic, Local Models, Future TecPey Models
- Memory Architecture — Conversation, profile, vector, tenant knowledge layers
- Prompt Registry — Versioned prompts with A/B testing support
- MCP Integration — Model Context Protocol for external tool access
- Cost Control — Tiered budgets, spend limits, model downgrades
- AI Governance — Permissions, security, observability, audit logs, analytics
- Failover Strategy — Graceful degradation when models unavailable
- Rate Limits — Per-agent, per-tier limits

**Supported Providers:**
- OpenAI (Production): GPT-4o, GPT-4o-mini, GPT-4.1-mini
- Anthropic (Planned): Claude Opus 4.8, Claude Sonnet 5, Claude Haiku 4.5
- Local Models (Planned): Llama, Mistral, custom fine-tunes
- TecPey Models (Future): Custom domain-specific models (Phase 50+)

---

## 9. Social & Reputation Layer Architecture

### Core Principles

1. Everything defaults to private
2. Sharing requires explicit opt-in per dimension
3. No PII in any shared record
4. Anonymous IDs are one-way (cannot reverse to real identity)

### Leaderboard Scoring (Hard Constraint)

```
OverallScore = weighted(
  Discipline × 0.25,
  Consistency × 0.20,
  Scenario × 0.20,
  Journal × 0.15,
  Risk × 0.20
)
```

P&L, winRate, and totalPnl are NEVER used in leaderboard scoring. This is a hard architectural constraint.

---

## 10. Target Deployment Architecture

### Current (Phase 39.5)
```
Nginx → Next.js (port 3000) → PostgreSQL (local)
                              → Redis (local)
```

### Target (Phase 23+)
```
CDN (Cloudflare)
    ↓
Load Balancer
    ↓
Next.js instances × N (auto-scale)
    ↓
    ├── PostgreSQL (primary + read replica)
    ├── Redis (rate limiting, session cache, webhook queue)
    ├── Object Storage (certificates, exports, AI logs)
    └── Message Queue (webhook delivery, background jobs)
```

---

## 11. Marketplace Architecture

**See [[MARKETPLACE_PLATFORM.md]] for complete marketplace architecture — Permanent Marketplace Architecture.**

The Marketplace is a multi-vendor digital marketplace embedded within the TecPey ecosystem. Categories include:

- AI Marketplace (personas, knowledge packs, prompts)
- Mentor Marketplace (courses, live sessions, evaluations)
- Strategy Marketplace (trading strategies, backtests, risk frameworks)
- Indicator Marketplace (Pine Script indicators, oscillators, dashboards)
- Signal Marketplace (educational signals only — strict compliance)
- Trading Bot Marketplace (paper-trading only by default)
- Prompt Marketplace (AI prompts, tutor scripts, assessment prompts)
- Template Marketplace (journals, study plans, risk plans)
- Plugin Marketplace (academy, trading, community, dashboard plugins)
- Developer Marketplace (SDKs, connectors, webhook templates)
- API Marketplace (data APIs, analysis APIs, compliance APIs)
- Automation Marketplace (trading, learning, report, compliance automations)
- Education Marketplace (courses, workbooks, study groups)
- Premium Content Marketplace (reports, video courses, eBooks)
- White-Label Marketplace (tenant courses, templates, compliance packs)
- Business Services Marketplace (consulting, training, auditing)
- Certification Marketplace (exams, prep materials, badges)

**Publishing Workflow:** Automated quality checks → Human review → Publishing decision

**Revenue Sharing:** 60-85% creator share depending on category (higher moderation = lower share)

**See [[REVENUE_MODEL.md]] for marketplace commission revenue streams.**

---

## 12. Governance & Compliance (Target)

### Audit Trail
All state-changing operations on sensitive data generate audit log entries with: tenantId, actorId, action, resourceType, resourceId, before, after, ipAddress, timestamp.

### Data Retention
| Data Type | Retention | Deletion |
|-----------|-----------|----------|
| Active student progress | Indefinite | On account deletion |
| Behavioral snapshots | 3 years | Automatic purge |
| Mentor conversations | 1 year (rolling) | Automatic purge |
| Certificates | Indefinite | Never deleted |
| Audit logs | 7 years | Legal retention |
| Trading journal | 1 year | On student request |

---

*Blueprint version 3.0 — Phase 39.5. This document defines the target architecture. Current state deviations are documented with [CURRENT STATE] markers.*
