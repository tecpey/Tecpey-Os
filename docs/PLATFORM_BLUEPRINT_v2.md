# TecPey — Platform Blueprint v2.0

**Phase 19 | Full System Blueprint**
**Date:** 2026-06-28
**Status:** Official — supersedes `docs/Architecture.md`

This document defines the target architecture. Current state deviations are noted with `[CURRENT STATE]` markers. Sections without such markers describe the target.

---

## 1. Identity Model

### 1.1 Core Entities

```
User
├── id: UUID (PK)
├── email: string (unique, verified)
├── emailVerifiedAt: timestamp | null
├── createdAt: timestamp
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
├── domain: string | null (custom domain for white-label)
└── createdAt: timestamp

TenantConfig
├── aiModel: string                    # override default Anthropic model
├── rateLimits: Record<string, number> # override per-endpoint limits
├── features: FeatureFlags             # per-tenant feature toggles
├── branding: BrandingConfig           # logo URL, colors, fonts
└── locales: string[]                  # enabled locales for this tenant
```

**[CURRENT STATE]** No tenant model. No unified User entity. Three separate auth tables (`academy_auth_accounts`, `academy_students`, implicit market user). No role hierarchy.

### 1.2 JWT Design (Target)

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

Single cookie: `tp_session` (httpOnly, secure, sameSite: lax). 8-hour expiry. Refresh via `/api/v1/auth/refresh` sliding window.

**[CURRENT STATE]** Three cookies (`user_session`, `tecpey_academy_auth`, `tecpey_student_session`). Admin in sessionStorage. No unified JWT.

---

## 2. Tenant Architecture

### 2.1 Tenant Resolution

```
Request arrives
    ↓
Middleware resolves Tenant
    ↓ (priority order)
1. Custom domain: `university.example.com` → lookup by domain
2. Subdomain: `myuniversity.tecpey.ir` → lookup by slug
3. X-Tenant-ID header (API clients) → lookup by id
4. Default: `tecpey.ir` → default tenant
    ↓
TenantContext injected into request
    ↓
All DB queries: AND tenant_id = $tenantId
All rate limits: keyed by tenant + user
All AI calls: use tenant.config.aiModel
```

### 2.2 Data Isolation Strategy

**Row-level isolation (current target):** `tenant_id` column on all data tables. All queries filter by `tenant_id`. No cross-tenant reads.

**Schema-level isolation (future option for white-label):** Each tenant gets its own PostgreSQL schema (`tenant_{slug}.students`, etc.). Higher isolation, higher operational cost. Evaluate at Phase 23.

### 2.3 White-Label Capability

A tenant with plan `white_label` can:
- Override all branding (logo, colors, fonts, domain)
- Restrict feature availability (e.g., disable Exchange, enable Academy only)
- Customize email templates
- Use their own AI API key (model selection)
- Receive data exports in their own format

---

## 3. Module Map

### 3.1 Core Modules

| Module | Current Location | Target Location | DB Tables | Status |
|---|---|---|---|---|
| Identity & Auth | `src/lib/academy-auth.ts`, `session.ts`, `auth-session.ts` | `src/services/identity/` | `users`, `tenant_memberships`, `sessions` | Needs Phase 21 |
| Academy Curriculum | `src/data/academy/` | CMS + `src/services/academy/` | `courses`, `terms`, `lessons`, `quizzes` | Needs Phase 28 |
| Student Progress | `src/lib/academy-progress.ts` (localStorage) | `src/services/progress/` | `student_progress` | Needs Phase 22 |
| Behavioral Engine | `src/lib/behavioral-engine.ts` (localStorage) | `src/services/behavioral/` | `behavioral_snapshots` | Needs Phase 22 |
| Trading DNA | `src/lib/trading-dna.ts` (localStorage) | `src/services/behavioral/` | `trading_dna_signals` | Needs Phase 22 |
| Trading Arena | `src/lib/trading-arena.ts` (localStorage) | `src/services/trading/` | `trading_sessions`, `positions`, `trades` | Needs Phase 22 |
| Trading Journal | `src/lib/trading-journal.ts` (localStorage) | `src/services/trading/` | `trade_journals` | Needs Phase 22 |
| Mentor AI | `src/app/api/ai-mentor*/` | `src/services/ai/` | `mentor_profiles`, `mentor_conversations` | Needs Phase 25 |
| Certificates | `src/lib/academy-certificates.ts` | `src/services/trust/` | `academy_certificates` | ✅ Server-side |
| Achievements | `src/lib/phase5-achievement-engine.ts` | `src/services/achievements/` | `student_achievements`, `achievement_catalog` | ✅ Server-side |
| Community (v1) | `src/lib/community-career.ts` | `src/services/community/` | `community_profiles` | Needs Phase 22 |
| Community (v2) | `src/lib/community-profile.ts` (localStorage) | `src/services/community/` | `community_profiles` | Needs Phase 22 |
| Leaderboard | `src/lib/community-leaderboard.ts` (computed) | `src/services/community/` | Aggregate view | Needs Phase 22 |
| Notifications | `src/app/api/notifications/` | `src/services/notifications/` | `notification_center`, `device_tokens` | ✅ Server-side |
| Rate Limiting | `src/lib/rate-limit.ts` | Same (upgrade Redis requirement) | Redis | Needs Phase 20 |
| SEO/GEO | `src/lib/seo.ts`, `src/lib/entity.ts` | Same | N/A | ✅ |

### 3.2 Module Dependencies

```
Identity & Auth
    ← required by → ALL authenticated modules

Tenant
    ← required by → ALL data modules (tenant_id)

Student Progress
    ← required by → Behavioral Engine, Mentor AI, Leaderboard

Behavioral Engine
    ← required by → Mentor AI, Leaderboard, Instructor Dashboard, Analytics

Trading Arena + Journal
    ← required by → Trading DNA → Behavioral Engine

Certificates
    ← required by → Trust & Verification, Leaderboard

Achievements
    ← required by → Leaderboard, Notifications

Community
    ← required by → Leaderboard, Instructor Dashboard

Mentor AI
    ← required by → Academy (lesson recommendations), Community (mentor interaction)
```

---

## 4. API Architecture

### 4.1 Versioning

All public APIs under `/api/v1/`. All routes follow REST conventions.

```
/api/v1/
├── auth/
│   ├── login         POST
│   ├── logout        POST
│   ├── register      POST
│   ├── me            GET
│   ├── refresh       POST
│   └── verify-email  POST
│
├── students/
│   ├── {id}/progress GET, PATCH
│   ├── {id}/export   GET (GDPR)
│   └── {id}/dna      GET
│
├── academy/
│   ├── terms         GET
│   ├── lessons/{id}  GET
│   └── progress      PATCH
│
├── mentor/
│   ├── ask           POST
│   ├── conversations GET (paginated)
│   ├── insights      GET
│   └── memory        GET
│
├── trading/
│   ├── arena         GET, PATCH
│   ├── journal       GET, POST, PATCH
│   └── scenarios     GET
│
├── community/
│   ├── profile       GET, PUT
│   ├── leaderboard   GET (paginated)
│   ├── challenges    GET
│   └── groups        GET
│
├── trust/
│   └── verify/{id}   GET (public)
│
└── admin/ (tenant_admin role required)
    ├── tenants       GET, POST
    ├── students      GET
    └── analytics     GET
```

### 4.2 Error Contract

All errors return:

```json
{
  "ok": false,
  "code": "AUTH_EXPIRED",
  "message": "Human-readable description",
  "details": {} // optional, structured
}
```

Error code categories:
- `AUTH_*` — authentication/authorization failures
- `VALIDATION_*` — input validation failures
- `RESOURCE_*` — not found, conflict, gone
- `RATE_*` — rate limit exceeded
- `AI_*` — AI service failures
- `INTERNAL_*` — unexpected server errors

### 4.3 Pagination Standard

All list endpoints support cursor-based pagination:

```
GET /api/v1/mentor/conversations?cursor=<opaque>&limit=20

Response:
{
  "data": [...],
  "nextCursor": "opaque-cursor-string",
  "hasMore": true
}
```

---

## 5. Database Architecture

### 5.1 Schema Strategy

All tables include:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)` (new tables)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

### 5.2 Core Table Groups

**Identity group:**
`users`, `sessions`, `email_verifications`, `password_resets`

**Tenant group:**
`tenants`, `tenant_memberships`, `tenant_configs`

**Academy group:**
`courses`, `terms`, `lessons`, `quizzes`, `quiz_answers`

**Progress group:**
`student_progress`, `lesson_completions`, `quiz_attempts`, `streaks`

**Behavioral group:**
`behavioral_snapshots`, `trading_dna_signals`, `behavioral_events`

**Trading group:**
`trading_sessions`, `open_positions`, `closed_trades`, `trade_journals`, `scenario_attempts`

**Mentor group:**
`mentor_profiles`, `mentor_conversations`, `mentor_memories`, `prompt_versions`

**Community group:**
`community_profiles`, `challenge_participations`, `group_interests`, `shared_journals`

**Trust group:**
`academy_certificates`, `certificate_verifications`, `trading_dna_attestations`

**Achievements group:**
`achievement_catalog`, `student_achievements`, `notification_center`, `device_tokens`

**Developer group:**
`oauth_clients`, `oauth_tokens`, `webhook_registrations`, `webhook_deliveries`, `api_keys`

**Analytics group:**
`learning_events`, `platform_metrics`, `cohort_snapshots`

### 5.3 Migration System

```
migrations/
├── 0001_init_identity.sql
├── 0002_init_tenant.sql
├── 0003_init_academy.sql
├── 0004_init_progress.sql
├── 0005_init_behavioral.sql
├── 0006_init_trading.sql
├── 0007_init_mentor.sql
├── 0008_init_community.sql
├── 0009_init_trust.sql
├── 0010_init_achievements.sql
├── 0011_init_developer.sql
└── 0012_init_analytics.sql

schema_migrations table:
  id: SERIAL
  version: TEXT (filename prefix)
  applied_at: TIMESTAMPTZ
  checksum: TEXT
```

---

## 6. AI Architecture

### 6.1 AI Gateway

All AI calls route through `src/services/ai/gateway.ts`:

```typescript
interface AIGateway {
  ask(params: {
    tenantId: string;
    userId: string;
    domain: AIDomain; // "mentor" | "support" | "admin" | "trading"
    messages: Message[];
    context: AIContext;
    promptVersion?: string;
  }): Promise<AIResponse>;
}

type AIContext = {
  studentDNA?: TradingDNASignals;
  behavioralSnapshot?: BehavioralSnapshot;
  courseProgress?: ProgressSummary;
  sessionHistory?: ConversationSummary;
};
```

### 6.2 Prompt Registry

```
src/prompts/
├── mentor/
│   ├── v1.0.txt
│   ├── v1.1.txt  ← current
│   └── v2.0.txt  ← draft
├── support/
│   └── v1.0.txt
└── registry.ts   ← maps domain + version to file
```

### 6.3 Model Selection Priority

```
1. Tenant override (tenant.config.aiModel)
2. Domain default (mentor → haiku, admin → opus)
3. Platform default (ANTHROPIC_DEFAULT_MODEL env var)
4. Fallback (claude-haiku-4-5-20251001)
```

### 6.4 Token Budget

Per-request budget enforced before API call:
- `mentor`: 8,000 tokens max context
- `support`: 4,000 tokens max context
- Strategy: summarize old messages, keep most recent N

---

## 7. Social & Reputation Layer

### 7.1 Privacy Architecture

```
Everything defaults to private.
Sharing requires explicit opt-in per dimension.
No PII in any shared record.
Anonymous IDs are one-way (cannot reverse to real identity without key).
```

### 7.2 Reputation Components

| Component | Data source | Privacy | Sharing |
|---|---|---|---|
| Trading DNA | Trading Arena + Journal | Private | Opt-in attestation |
| Behavioral Score | Behavioral Engine | Private | Opt-in to leaderboard |
| Certificate | Academy completion | Public (default) | Verifiable URL |
| Streak | Progress events | Private | Opt-in to community |
| Journal | Trade journal | Private | Opt-in, sanitized |
| Group membership | Study groups | Private | Opt-in interest |

### 7.3 Leaderboard Model

All leaderboard scoring is behavioral, never financial:

```
DisciplineScore = stopLossRate × 0.6 + streakBonus × 0.4
ConsistencyScore = activeDays/30 × 0.5 + streak × 0.5
ScenarioMasteryScore = scenariosPassed/6 × 100
JournalQualityScore = completionRate × 100
RiskManagementScore = stopLossRate × 0.6 + (1 - overRiskRate) × 0.4
OverallScore = weighted(Discipline × 0.25, Consistency × 0.20, Scenario × 0.20, Journal × 0.15, Risk × 0.20)
```

P&L, winRate, and totalPnl are NEVER used in any leaderboard scoring. This is a hard architectural constraint.

---

## 8. Developer Platform

### 8.1 OAuth 2.0 Flow

```
Client registration → Client ID + Secret
Authorization request → /oauth/authorize → user consent
Authorization code → /oauth/token → access token + refresh token
API call with Bearer token → /api/v1/*
Token refresh → /oauth/token (grant_type=refresh_token)
```

### 8.2 Webhook System

```typescript
type WebhookEvent =
  | "student.progress.updated"
  | "certificate.issued"
  | "mentor.session.completed"
  | "challenge.completed"
  | "trading_dna.updated"
  | "community.profile.updated";

type WebhookDelivery = {
  id: UUID;
  registrationId: UUID;
  event: WebhookEvent;
  payload: object;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  nextRetryAt: timestamp | null;
};
```

Delivery: POST to registered URL. Retry with exponential backoff (3 attempts). HMAC-SHA256 signature on payload.

### 8.3 SDK Surface

```typescript
// @tecpey/sdk
const client = new TecPeyClient({ apiKey: "...", tenantId: "..." });

// Student management
await client.students.getProgress(studentId);
await client.students.getDNA(studentId);

// Certificates
await client.certificates.verify(certificateId);

// Webhooks (server-side registration)
await client.webhooks.register({ url, events, secret });
```

---

## 9. Financial Ecosystem Architecture

### 9.1 Wallet Abstraction

```typescript
interface AbstractWallet {
  id: string;
  tenantId: string;
  userId: string;
  type: WalletType; // "educational" | "exchange" | "savings" | "escrow"
  balance: Record<string, Decimal>; // currency → amount
  transactions(): Promise<Transaction[]>;
  canTransact(amount: Decimal, currency: string): boolean;
}
```

The Educational Wallet (Trading Arena) implements `AbstractWallet`. The Exchange Wallet (`my.tecpey.ir`) implements `AbstractWallet`. This allows unified portfolio view without shared infrastructure.

### 9.2 Future Product Placeholders

These are architectural reservations — no implementation in Phases 20–25:

| Product | Model | Compliance consideration |
|---|---|---|
| Savings plans | Goal-based locked balance, scheduled contributions | Deposit-taking regulation |
| Investment clubs | Group wallet, shared goal, individual shares | Fund management regulation |
| Educational capital pools | Pooled paper money for collaborative simulation | No real money — educational only |
| Compliant lending | Request → offer → acceptance → disbursement → repayment | Lending license per jurisdiction |
| Escrow | Locked funds, condition-based release | Escrow provider license |

---

## 10. Observability Architecture

### 10.1 Logging

```typescript
// Every API route uses the request-scoped logger
import { logger } from "@/lib/logger";

// In middleware:
const log = logger.child({ requestId: req.headers["x-request-id"] });

// In route handler:
log.info({ userId, action: "mentor.ask", tokenCount: 423 }, "Mentor request");
log.error({ err, userId }, "DB query failed");
```

### 10.2 Metrics

- Request latency: p50, p95, p99 per route
- DB query time: p50, p95 per query
- AI API latency: p50, p95
- Error rate per route
- Active user sessions

### 10.3 Health Checks

```
GET /api/health      → { status: "ok" }              (shallow — always fast)
GET /api/ready       → { db: bool, redis: bool, ai: bool }  (deep — may be slow)
GET /api/metrics     → Prometheus format (internal only)
```

---

## 11. Deployment Architecture

### 11.1 Current (Phase 18)

```
Nginx → Next.js (PM2, port 3000) → PostgreSQL (local)
```

### 11.2 Target (Phase 23+)

```
CDN (CloudFlare)
    ↓
Load Balancer
    ↓
Next.js instances × N (auto-scale)
    ↓
    ├── PostgreSQL (primary) + Read Replica
    ├── Redis (rate limiting, session cache, webhook queue)
    ├── Object Storage (certificates, exports, AI logs)
    └── Message Queue (webhook delivery, background jobs)
```

### 11.3 Environment Model

```
development → local DB, in-memory rate limit, mock AI responses
staging     → real DB (isolated), Redis, real AI (throttled)
production  → full stack, monitoring, alerting
```

---

## 12. Governance & Compliance

### 12.1 Audit Trail

All state-changing operations on sensitive data generate an audit log entry:

```typescript
type AuditEvent = {
  tenantId: string;
  actorId: string;
  action: string;        // "student.data.exported" | "admin.tenant.created" ...
  resourceType: string;
  resourceId: string;
  before: object | null;
  after: object | null;
  ipAddress: string;
  userAgent: string;
  timestamp: timestamp;
};
```

### 12.2 Data Retention Policy

| Data Type | Retention | Deletion method |
|---|---|---|
| Active student progress | Indefinite | Deleted on account deletion |
| Behavioral snapshots | 3 years | Automatic purge after 3 years inactive |
| Mentor conversations | 1 year (rolling) | Automatic purge |
| Certificates | Indefinite | Never deleted (anchor hash preserved) |
| Audit logs | 7 years | Legal retention |
| Trading journal | 1 year or student-deleted | On student request |

### 12.3 GDPR / Data Rights

| Right | Implementation |
|---|---|
| Access | `GET /api/v1/students/{id}/export` |
| Rectification | Student can update profile data |
| Erasure | Account deletion purges all PII; anonymized aggregate data retained |
| Portability | Export is JSON-formatted, machine-readable |
| Objection to processing | Opt-out of behavioral analytics |

---

*Blueprint version 2.0 — Phase 19. Reviewed against actual codebase state as of 2026-06-28.*
