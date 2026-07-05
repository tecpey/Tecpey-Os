# Feature Registry — TecPey Platform Feature Inventory

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Official
**Purpose:** Complete inventory of all TecPey features with readiness status, location, and dependencies.

---

## Feature Status Definitions

| Status | Meaning |
|--------|---------|
| ✅ **Production** | Complete, tested, and production-ready |
| ⚠️ **Functional** | Works but has known gaps or technical debt |
| 🧪 **Experimental** | Implemented but not validated for production |
| 🔧 **In Progress** | Under active development |
| 🚧 **Scaffold** | Route/component exists but content is shallow |
| ❌ **Not Started** | Not implemented |

---

## Section 1 — Platform Core

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Next.js 16 App Router | ✅ Production | `src/app/` | Fully operational |
| Custom Server (WebSocket) | ✅ Production | `server.ts` | WS, Redis pub/sub, workers |
| PostgreSQL Database | ✅ Production | `src/lib/db.ts` | Schema-on-connect pattern |
| Redis Integration | ✅ Production | `src/lib/redis-pubsub.ts` | BullMQ, pub/sub, rate limiting |
| TypeScript Strict Mode | ✅ Production | `tsconfig.json` | 0 errors maintained |
| ESLint 0 Warnings | ✅ Production | `eslint.config.mjs` | Enforced in CI |
| CI Pipeline | ✅ Production | `.github/workflows/ci.yml` | Lint, typecheck, build |

---

## Section 2 — Authentication & Security

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| JWT Sessions (jose) | ✅ Production | `src/lib/auth-session.ts` | httpOnly cookies |
| CSRF Protection | ⚠️ Functional | `src/lib/csrf.ts` | Inconsistent on some routes — P0 |
| 2FA (TOTP) | ✅ Production | `src/lib/security/totp.ts` | QR enrollment, backup codes |
| WebAuthn/Passkeys | ✅ Production | `src/lib/security/webauthn.ts` | Native FIDO2 |
| Session Revocation | ✅ Production | `src/app/api/auth/sessions/` | — |
| API Keys | ⚠️ Functional | `src/lib/security/api-key-auth.ts` | Replay disabled without Redis — P0 |
| Rate Limiting | ⚠️ Functional | `src/lib/rate-limit.ts` | Per-instance fallback — P1 |
| Admin Auth | ⚠️ Functional | `src/lib/admin-auth.ts` | Raw token in cookie — P0 |
| Security Metrics | ✅ Production | `src/lib/security/auth-metrics.ts` | Admin dashboard |
| Security Notifications | ✅ Production | `src/lib/security/security-notifications.ts` | 11 notification types |

---

## Section 3 — Academy

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| 7-Term Curriculum Routes | ✅ Production | `src/app/academy/` | Complete route structure |
| Quiz Engine | ✅ Production | Academy components | Per-term knowledge checks |
| Spaced Repetition (SM-2) | ⚠️ Functional | `src/lib/spaced-repetition.ts` | localStorage-based |
| Flashcards | ⚠️ Functional | `src/app/academy/flashcards/` | localStorage-based |
| Certificates with QR | ✅ Production | `src/lib/academy-certificates.ts` | Verified at `/verify/[id]` |
| AI Mentor | ✅ Production | `src/app/api/ai-mentor/` | OpenAI integration |

**See [[AI_PLATFORM.md]] — Permanent AI Constitution.** Complete AI architecture defined including:
- TecPey AI (Core Brain), Mentor AI, Trading AI, Admin AI, Executive AI
- C-Level AI Agents, Marketplace AI, White-label AI, Customer AI, Internal AI
- AI Gateway, Model Router, Memory Architecture, Prompt Registry, MCP Integration

| Mentor Profile/Insights | ✅ Production | Mentor API | Server-side profiles |
| Mentor Memory Engine | ✅ Production | `src/lib/mentor-memory.ts` | TTL-based memories |
| Trading Arena | ⚠️ Functional | `src/app/academy/trading-arena/` | localStorage+server |
| Trading DNA | ⚠️ Functional | `src/lib/trading-dna.ts` | localStorage |
| Mastery Gating | ✅ Production | Academy | 80% threshold |
| Streak System | ⚠️ Functional | Multiple locations | localStorage |
| Daily Challenge | 🚧 Scaffold | `src/app/academy/daily-challenge/` | Route exists |
| Portfolio Lab | 🚧 Scaffold | `src/app/academy/portfolio-lab/` | Route exists |
| Psychology Lab | 🚧 Scaffold | `src/app/academy/psychology-lab/` | Route exists |
| Career/Community | 🚧 Scaffold | `src/app/academy/career/` | Partial |
| Graduation | ✅ Production | `src/app/academy/graduation/` | Final assessment |
| Term 1–7 Pages | ✅ Production | `src/app/academy/term-*` | All 7 terms |
| Specialized Program | 🚧 Scaffold | `src/app/academy/specialized-program/` | Route exists |
| Education-First Path | ✅ Production | `src/app/academy/education-first/` | — |
| Security-First Path | ✅ Production | `src/app/academy/security-first/` | — |
| AI Guide | ✅ Production | `src/app/academy/ai-guide/` | Educational AI |

---

## Section 4 — Trading System

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Order Placement | ✅ Production | `src/app/api/orders/` | Limit + market |
| Order Cancellation | ✅ Production | `src/app/api/orders/[id]/` | — |
| Balance Holds | ✅ Production | `src/lib/trading/` | Risk checks |
| Order Book | ⚠️ Functional | `src/lib/trading/order-book.ts` | In-memory + Redis |
| Matching Engine | ✅ Production | `src/lib/trading/matching-engine.ts` | Factory pattern |
| Stop-Limit Orders | ❌ Not Started | `src/lib/trading/validation.ts` | Accepted but not implemented — P0 |
| Spot Engine Helpers | ✅ Production | `src/helper/spot/` | — |
| Market Data API | ✅ Production | `src/app/api/markets/` | Real-time prices |
| WebSocket Feed | ✅ Production | `src/lib/ws/` | Custom WS server |
| TradingView Integration | ✅ Production | `public/charting_library/` | Widget integration |

---

## Section 5 — Wallet & Withdrawals

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Hot Wallet KeyStore | ✅ Production | `src/lib/wallet/signing/keystore.ts` | Env-var keys |
| Bitcoin Provider (P2WPKH) | ⚠️ Functional | `src/lib/wallet/providers/bitcoin.ts` | Only signs input 0 |
| Ethereum Provider | ⚠️ Functional | `src/lib/wallet/providers/ethereum.ts` | Nonce race condition |
| Solana Provider | ⚠️ Functional | `src/lib/wallet/providers/solana.ts` | SOL only, no SPL |
| Tron Provider | ❌ Not Started | `src/lib/wallet/providers/` | Currently broken |
| Fee Engine | ✅ Production | `src/lib/wallet/fee/engine.ts` | Dynamic per chain |
| Confirmation Engine | ✅ Production | `src/lib/wallet/confirmation/engine.ts` | Chain-specific |
| BullMQ Queues | ✅ Production | `src/lib/wallet/queue/` | 5 queues |
| Withdrawal Worker | ✅ Production | `src/workers/withdrawal-worker.ts` | Lifecycle managed |
| Observatory | ✅ Production | `src/lib/wallet/observability.ts` | Redis metrics |
| HSM KeyStore | ❌ Not Started | `src/lib/wallet/signing/keystore.ts` | Stub — throws |
| MPC KeyStore | ❌ Not Started | `src/lib/wallet/signing/keystore.ts` | Stub — throws |
| Multisig | ❌ Not Started | Untracked | Scaffolding only |
| Wallet Policy Engine | ❌ Not Started | Untracked | Missing cache.ts |

---

## Section 6 — Security & Compliance

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Withdrawal Security Gates | ✅ Production | `src/lib/security/withdrawal-service.ts` | State machine |
| KYC (Sumsub) | ⚠️ Functional | `src/lib/compliance/sumsub.ts` | Mock fallback — P0 |
| AML (Chainalysis) | ⚠️ Functional | `src/lib/compliance/chainalysis.ts` | Graceful degrade |
| Sanctions (OFAC) | ✅ Production | `src/lib/compliance/ofac.ts` | Always registered |
| Audit Logging | ✅ Production | Security lib | Withdrawal actions |
| Device Fingerprinting | ✅ Production | `src/lib/security/webauthn.ts` | SHA-256 |
| Price Feed Alerting | ❌ Not Started | `src/app/api/internal/price-feed-status/` | Endpoint public — P0 |

---

## Section 7 — Content & Public Pages

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Persian Landing | ✅ Production | Root layout | Full RTL |
| English Mirror | ✅ Production | `/en/` | ~30 route groups |
| Markets Page | ✅ Production | `src/app/markets/` | Live board |
| Crypto Pages (50+ coins) | ✅ Production | `src/app/crypto/[symbol]/` | Coin dossiers |
| Glossary | ✅ Production | `src/app/glossary/` | Searchable |
| Compare Exchanges | ✅ Production | `src/app/compare-exchanges/` | — |
| SEO/GEO | ✅ Production | `src/lib/seo.ts` | Full structured data |
| Crypto News | ✅ Production | `src/app/crypto-news/` | Aggregated |
| Contact Form | 🚧 Scaffold | `src/app/contact-us/` | mailto only |
| FAQ | ✅ Production | `src/app/faq/` | — |
| Risk Disclosure | ✅ Production | `src/app/risk-disclosure/` | — |
| Trading Tools | ✅ Production | `src/app/trading-tools/` | — |

---

## Section 8 — Admin & Operations

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Command Center | ✅ Production | `src/app/api/command-center/` | Admin panel |
| Withdrawal Admin Queue | ✅ Production | `src/app/api/admin/withdrawals/` | Review/approve/reject |
| Custody Admin | 🚧 Scaffold | `src/app/api/admin/custody/` | Partial routes |
| Health Endpoint | ✅ Production | `src/app/api/health/` | — |
| Database Health | ✅ Production | `src/app/api/health/database/` | — |
| Security Metrics Dashboard | ✅ Production | `src/app/api/admin/security-metrics/` | — |

---

**See [[WHITE_LABEL_PLATFORM.md]] — Permanent White-Label Architecture.** Complete tenant architecture defined:
- Business Model, Tenant Architecture, Branding, Custom Domains, Localization
- AI Branding, Customer Dashboard, Billing, Subscription, Deployment Models
- License Types, Marketplace Integration, API Access, Analytics, Security Isolation

**See [[MARKETPLACE_PLATFORM.md]] — Permanent Marketplace Architecture.** All 17 categories defined:
- AI, Mentor, Strategy, Indicator, Signal, Trading Bot, Prompt, Template, Plugin
- Developer, API, Automation, Education, Premium Content, White-Label, Business Services, Certification
- Publishing Workflow, Revenue Sharing, Moderation, Fraud Prevention

**See [[REVENUE_MODEL.md]] — Official Revenue Registry.** 32+ revenue streams catalogued:
- Core: Exchange Fees, VIP Plans, Spread
- Academy: Certificates (Premium/Physical)
- Trading Lab: Lab Access, Simulation Rooms
- AI: Mentor Subscription, Premium Models, Enterprise AI
- White-Label: Licenses, Setup & Deployment
- Marketplace: Commission, Featured Listings
- Developer: Platform Access, API Overages
- Business Services: Dashboard, Analytics Export
- Compliance: KYC, AML Services
- Wallet/Custody: Wallet Services, Custody Services
- Platform Services: Notifications
- Advertising: Ads, Sponsored Content
- Partnership: Partner Program, Referral System
- Enterprise: Support, Consulting
- Licensing: Technology Licensing
- Data: Anonymized Data Products
- Future: 8 planned streams (RS-033 to RS-040)

## Section 9 — Infrastructure Features

| Feature | Status | Location | Notes |
|---------|--------|----------|-------|
| Docker Build | ✅ Production | `Dockerfile` | Multi-stage |
| Docker Compose | ✅ Production | `docker-compose.production.yml` | Web + PG + Redis |
| PM2 Ecosystem | ✅ Production | `ecosystem.config.cjs` | Uses server.ts |
| Systemd Service | ✅ Production | `deploy/systemd/tecpey-web.service` | Uses npm start |
| Nginx Config | ✅ Production | `deploy/nginx/tecpey.conf` | SSL, CSP, HSTS |
| GitHub Actions CI | ✅ Production | `.github/workflows/ci.yml` | Lint, typecheck, build |
| Issue Templates | ✅ Production | `.github/ISSUE_TEMPLATE/` | Bug + feature |
| PR Template | ✅ Production | `.github/PULL_REQUEST_TEMPLATE.md` | — |

---

## Feature Count Summary

| Status | Count | Notes |
|--------|-------|-------|
| ✅ Production | 45+ | Fully operational features |
| ⚠️ Functional | 15 | Works but has known gaps |
| 🧪 Experimental | 0 | — |
| 🔧 In Progress | 0 | Phase 39 frozen |
| 🚧 Scaffold | 7 | Routes exist, shallow content |
| ❌ Not Started | 6 | Tron, HSM, MPC, multisig, stop-limit, price-feed alerting |

---

*Feature registry for Phase 39.5. Reflects current implementation state.*
