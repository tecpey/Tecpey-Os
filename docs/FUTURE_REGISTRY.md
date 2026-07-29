# Future Registry — Planned & Deferred Features

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Official — supersedes feature planning in `docs/FUTURE_MODULES.md`
**Purpose:** Complete inventory of all planned, deferred, and future features with priority and phase targets.

---

## Priority Definitions

| Priority | Meaning |
|----------|---------|
| **P0** | Production blocker. Must be resolved before public launch. |
| **P1** | Confident-release blocker. Must be resolved before growth push. |
| **P2** | Should land before major growth / marketing campaigns. |
| **P3** | Post-launch. Valuable but not blocking. |
| **P4** | Long-term strategic. No timeline. |

---

## Section 1 — Security & Compliance (Highest Priority)

| Feature | Priority | Target Phase | Current State | Dependencies |
|---------|----------|-------------|---------------|--------------|
| CSRF Enforcement (all routes) | P0 | 39.6 | Inconsistent | None |
| Admin Session Replacement | P0 | 39.6 | Raw token in cookie | None |
| API Key Replay Protection | P0 | 39.6 | Disabled without Redis | Redis requirement |
| Production KYC (Sumsub) | P0 | 39.6 | Mock fallback | Sumsub credentials |
| Price-Feed Auth | P0 | 39.6 | Public endpoint | None |
| Rate Limiting (Redis) | P1 | 39.6 | Per-instance fallback | Redis |
| Local Auth Storage Block | P0 | 39.6 | Env-enabled in prod | None |
| CSP Tightening | P1 | 39.6 | Broad fallbacks | — |
| Stop-Limit Rejection | P0 | 39.6 | Accepted but not implemented | Validation changes |

---

## Section 2 — Wallet & Trading

| Feature | Priority | Target Phase | Current State | Dependencies |
|---------|----------|-------------|---------------|--------------|
| HSM KeyStore Implementation | P1 | 40 | Throwing stub | Hardware HSM |
| MPC KeyStore Implementation | P2 | 40 | Throwing stub | MPC network |
| Bitcoin Multisig | P2 | 40 | Scaffolding only | — |
| Wallet Policy Engine | P2 | 40 | Missing cache.ts | — |
| Tron Provider Fix | P1 | 40 | Broken (inherits ETH) | Correct Tron SDK |
| Solana SPL Tokens | P2 | 40 | SOL only | SPL Program |
| Bitcoin P2SH/P2TR Outputs | P3 | 40+ | P2WPKH only | — |
| Stop-Limit Implementation | P1 | 40 | Not started | Trigger engine |
| Multiple Input Signing (BTC) | P1 | 40 | Signs only input 0 | — |
| Ethereum Nonce Fix | P1 | 40 | Race condition | Atomic nonce mgmt |

---

## Section 3 — Infrastructure

| Feature | Priority | Target Phase | Current State | Dependencies |
|---------|----------|-------------|---------------|--------------|
| Database Migration Runner | P1 | 41 | Schema-on-connect | — |
| Structured Logging (Pino) | P2 | 41 | None | — |
| Error Monitoring (Sentry) | P2 | 41 | None | — |
| Deep Health Endpoints | P2 | 41 | Basic | — |
| Zod Input Validation | P2 | 41 | Inconsistent | — |
| Performance Bundle Analysis | P2 | 45 | Not measured | — |
| Chart Stack Consolidation | P3 | 45 | 3 stacks | Decision needed |

---

## Section 4 — Identity & Auth Overhaul

| Feature | Priority | Target Phase | Current State | Dependencies |
|---------|----------|-------------|---------------|--------------|
| Unified Identity Model | P1 | 42 | 3 cookies | Phase 41 migrations |
| Single JWT Session | P1 | 42 | 3 JWTs | Phase 42 |
| API Versioning (/api/v1) | P2 | 42 | No versioning | Phase 42 |
| Structured Error Codes | P2 | 42 | Inconsistent | Phase 42 |
| Role-Based Access Control | P2 | 42 | Flat enum | Phase 42 |

---

## Section 5 — Server-Side Persistence

| Feature | Priority | Target Phase | Current State | Dependencies |
|---------|----------|-------------|---------------|--------------|
| Academy Progress (Server) | P1 | 43 | localStorage | Phase 42 auth |
| Trading Arena (Server) | P1 | 43 | localStorage | Phase 42 auth |
| Trading Journal (Server) | P1 | 43 | localStorage | Phase 42 auth |
| Behavioral Engine (Server) | P1 | 43 | localStorage | Phase 42 auth |
| Spaced Repetition (Server) | P1 | 43 | localStorage | Phase 42 auth |
| Community Profile (Server) | P2 | 43 | localStorage | Phase 42 auth |
| Community Challenges (Server) | P2 | 43 | localStorage | Phase 42 auth |
| Real Leaderboard | P2 | 43 | LCG demo peers | Phase 43 |
| GDPR Export Endpoint | P2 | 43 | Not possible | Phase 43 |

---

## Section 6 — Multi-Tenant & White-Label

**See [[WHITE_LABEL_PLATFORM.md]] — Permanent White-Label Architecture.** Complete architecture defined:
- Business Model, Tenant Architecture, Branding System, Custom Domains, Localization
- AI Branding, Customer Dashboard, Billing, Subscription, Deployment Models
- License Types, Marketplace Integration, API Access, Analytics, Security Isolation
- Upgrade Path, Enterprise Features, Support Model, Operational Model, Future Expansion

| Feature | Priority | Target Phase | Current State | Dependencies |
|---------|----------|-------------|---------------|--------------|
| Tenants Table | P2 | 44 | Not exists | Phase 42 auth |
| Tenant Memberships | P2 | 44 | Not exists | Phase 42 auth |
| Tenant Resolution Middleware | P2 | 44 | Not exists | Phase 44 |
| Per-Tenant Config | P3 | 44 | Not exists | Phase 44 |
| White-Label Branding | P3 | 44 | Not exists | Phase 44 |
| Custom Domain Support | P3 | 44 | Not exists | Phase 44 |

---

## Section 7 — Product Features

| Feature | Priority | Target Phase | Current State | Dependencies |
|---------|----------|-------------|---------------|--------------|
| Mobile App (React Native) | P2 | 46 | Not started | Phase 43 API |
| Arabic Language | P2 | 47 | Not started | Phase 44 i18n |
| Dark/Light Mode Consistency | P2 | 45 | Mostly complete | — |
| Contact Form Backend | P2 | 45 | mailto only | — |
| Performance Optimization | P2 | 45 | Not measured | — |
| Lazy-Load Mentor Widget | P2 | 45 | Root layout | — |
| English SEO Parity | P2 | 45 | Needs improvement | — |
| Accessibility WCAG Audit | P3 | 45 | Not started | — |

---

## Section 8 — Developer Platform

**See [[MARKETPLACE_PLATFORM.md]] — Permanent Marketplace Architecture.** All 17 marketplace categories defined:
- AI, Mentor, Strategy, Indicator, Signal, Trading Bot, Prompt, Template, Plugin
- Developer, API, Automation, Education, Premium Content, White-Label, Business Services, Certification
- Publishing Workflow, Review Process, Quality Control, Revenue Sharing
- Payments, Subscriptions, Licensing, Moderation, Ranking, Search, Recommendations, Fraud Prevention

| Feature | Priority | Target Phase | Current State | Dependencies |
|---------|----------|-------------|---------------|--------------|
| Public API Documentation | P3 | 48 | Not started | Phase 42 |
| OAuth 2.0 | P3 | 48 | WebAuthn only | Phase 42 |
| Webhook System | P3 | 48 | Not started | Phase 44 |
| TypeScript SDK | P4 | 48 | Not started | Phase 48 |
| Plugin Marketplace | P4 | 48 | Not started | Phase 48 |

---

## Section 9 — AI

**See [[AI_PLATFORM.md]] — Permanent AI Constitution.** Complete AI ecosystem defined:
- TecPey AI (Core Brain), Mentor AI, Trading AI, Admin AI, Executive AI
- C-Level AI Agents (CTO, CPO, CMO, CFO, CRO), Marketplace AI, White-label AI
- Customer AI, Internal AI, AI Gateway, Model Router
- Memory Architecture (Conversation, Profile, Vector, Tenant Knowledge)
- Prompt Registry, MCP Integration, Cost Control, AI Governance
- AI Permissions, AI Security, AI Observability, AI Audit Logs, AI Analytics
- AI Failover Strategy, AI Rate Limits
- Supported Providers: OpenAI (Production), Anthropic (Planned), Local Models (Planned), TecPey Models (Future)

| Feature | Priority | Target Phase | Current State | Dependencies |
|---------|----------|-------------|---------------|--------------|
| AI Model Service | P2 | 49 | Direct API calls | — |
| Prompt Registry | P2 | 49 | Hardcoded prompts | — |
| A/B Testing for Prompts | P3 | 49 | Not started | — |
| AI Response Streaming | P3 | 49 | Not started | — |
| Multi-Language AI | P3 | 49 | Persian only | — |
| Content Moderation Pipeline | P3 | 49 | Not started | — |

---

## Section 10 — Strategic (Phase 50+)

| Feature | Priority | Target Phase | Notes |
|---------|----------|-------------|-------|
| Global Launch Readiness | P1 | 50 | Load test, red team, legal review |
| Iranian Crypto Regulations | P2 | 50+ | Compliance per jurisdiction |
| Financial Products | P3 | 50+ | Savings, clubs, lending |
| Prop Firm Network | P3 | 50+ | Partnership pipeline |
| Creator Economy | P4 | 50+ | Plugin marketplace |

---

## Deferred Features Summary

**See [[REVENUE_MODEL.md]] — Official Revenue Registry.** 32+ revenue streams defined:
- Core Revenue: Exchange Trading Fees, VIP Plans, Spread Revenue
- Academy Revenue: Academy Basic (Free), Premium Certificates, Physical Certificates
- Trading Lab Revenue: Trading Lab Access, Simulation Rooms
- AI Revenue: AI Mentor Subscription, Premium AI Models, Enterprise AI
- White-Label Revenue: White-Label Licenses, White-Label Setup & Deployment
- Marketplace Revenue: Marketplace Commission, Featured Listings
- Developer Revenue: Developer Platform Access, API Usage Overages
- Business Services Revenue: Business Dashboard, Analytics Export
- Compliance Services Revenue: KYC Services, AML Services
- Wallet & Custody Revenue: Wallet Services, Custody Services
- Platform Services Revenue: Notification Services
- Advertising & Content Revenue: Advertising, Sponsored Content
- Partnership Revenue: Partner Program, Referral System
- Enterprise Revenue: Enterprise Support, Consulting Services
- Licensing Revenue: Technology Licensing
- Data Revenue: Anonymized Data Products
- Future Revenue: 8 planned streams (RS-033 to RS-040)

Total planned features: 55+
- P0: 7 (all security — Phase 39.6)
- P1: 15
- P2: 18
- P3: 10
- P4: 5

---

*Future registry for Phase 39.5. Reflects planning as of 2026-07-05.*
