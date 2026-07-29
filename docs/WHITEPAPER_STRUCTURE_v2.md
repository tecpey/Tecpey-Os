# TecPey — Whitepaper Structure v2.0

**Phase 19 | Platform Architecture & Strategy Document**
**Date:** 2026-06-28
**Classification:** Public (when finalized)

This is a structural whitepaper — it defines what TecPey is, how it works, and what it is building toward. It is not a marketing document. It contains no profit promises, no investment solicitation, and no speculative financial claims.

---

## Section 1 — Problem Statement

### 1.1 The Financial Literacy Gap

Financial markets are accessible to more people than at any point in history. The tools to participate cost nothing. The barrier is not access — it is preparation.

The result is predictable: most retail market participants lose money not because markets are rigged, but because they enter without the knowledge, discipline, or emotional preparation to navigate volatility. The losses are financial and psychological.

Studies across markets consistently show:
- The majority of retail traders lose money over any 12-month period
- Losses are concentrated among those with the least preparation
- Education measurably reduces loss rates among those who receive it

### 1.2 The Education Gap in Persian-Language Markets

The Persian-speaking market — Iran, Afghanistan, Tajikistan, diaspora communities — has a population of 120+ million people with high demand for financial education and extremely limited access to high-quality, native-language, responsible financial education.

What exists today:
- YouTube channels incentivized by trading signal sales (conflict of interest)
- Telegram groups mixing education with speculation promotion
- Translated content with no cultural adaptation
- No standardized, verifiable educational credentials

What does not exist:
- A structured, curriculum-based financial education platform in Persian
- A behavioral competence assessment framework in Persian
- A verifiable, employer-recognized credential for financial literacy in Persian
- A safe practice environment connected to structured learning

### 1.3 The Institutional Gap

Educational institutions (universities, trade schools) and financial institutions (prop firms, banks, investment firms) need a way to assess and develop financial competence in candidates and employees. No standardized tool exists for the Persian-speaking market. No white-label infrastructure exists that they could deploy.

---

## Section 2 — TecPey Platform Architecture

### 2.1 What TecPey Is

TecPey is a **Digital Financial Education Platform** built as an **Enterprise SaaS infrastructure**. It provides:

- A structured educational curriculum for financial market competence
- A behavioral intelligence layer that measures and develops discipline, patience, and risk awareness
- A safe simulation environment for practice without real money
- A verifiable credential system for proven financial education
- A privacy-first social layer for peer accountability
- An enterprise API for institutions to build on

### 2.2 The Twelve Pillars

See `VISION_v2.md` Section 3 for the full pillar definitions. Summary:

1. Exchange — Market access
2. Academy — Structured education
3. Financial Ecosystem — Products beyond spot trading
4. Social & Reputation Layer — Privacy-first community
5. AI Operating System — Cross-domain intelligence
6. Developer Platform — SDK, APIs, webhooks
7. Enterprise SaaS — Subscription, billing, SLAs
8. Multi-Tenant Infrastructure — Tenant isolation, white-label
9. White Label System — Full rebrand capability
10. Analytics & Intelligence — Aggregate behavioral insights
11. Trust & Verification — Credential verification
12. Governance & Compliance — Jurisdiction-aware compliance

### 2.3 Architecture Principles

**API-first:** Every TecPey capability is accessible via a documented, versioned API. The TecPey web application is a first-party client of the same APIs that third parties use.

**Privacy-first:** Behavioral data belongs to the student. It is used to help them, not monetized, not sold. Every sharing feature defaults to private. Opt-in is the only acceptable pattern for personal data.

**Security-first:** Authentication is via industry-standard JWT. All state-changing operations require origin validation. Rate limiting is enforced on every public endpoint. Input is validated before processing.

**Multi-tenant from day one:** Every data record carries a `tenant_id`. Tenants are fully isolated at the data layer. A university deployment cannot access a retail student's data.

**AI-ready:** The behavioral intelligence layer produces structured, machine-readable profiles. The AI gateway accepts these profiles as context. Every AI interaction is contextualized with the student's behavioral signature.

---

## Section 3 — The Behavioral Intelligence Layer

### 3.1 What Is Trading DNA?

Trading DNA is TecPey's proprietary model for measuring behavioral competence in financial contexts. It is a 12-dimensional profile built from observable behavior, not self-reported assessment.

The 12 dimensions:
1. **Discipline** — Consistency between stated plan and executed behavior
2. **Patience** — Ability to wait for conditions to match criteria
3. **Risk Management** — Adherence to position sizing and stop-loss discipline
4. **Reflection** — Quality and consistency of post-trade self-assessment
5. **FOMO Resistance** — Resistance to entering positions driven by fear of missing out
6. **Revenge Trading Control** — Resistance to reactive trading after losses
7. **Decision Quality** — Quality of entry and exit rationale
8. **Consistency** — Regularity of engagement and study habits
9. **Knowledge Retention** — Accuracy on quizzes after spaced intervals
10. **Emotional Regulation** — Stability of decision-making across emotional states
11. **Learning Velocity** — Speed of behavioral improvement across sessions
12. **Risk Awareness** — Demonstrated understanding of risk in simulation scenarios

### 3.2 How Scores Are Computed

Each dimension has a scorer function. Scorers are pure functions of observable inputs. No scores are inferred — they are computed from events:

- Quiz performance (knowledge retention, decision quality)
- Trading Arena behavior (discipline, patience, FOMO, revenge, risk management)
- Trade journal entries (reflection, emotional regulation)
- Study session patterns (consistency, learning velocity)
- Scenario outcomes (risk awareness, patience)

Scores range 0–100. Higher is better for every dimension.

### 3.3 Privacy Model

Trading DNA scores are:
- Stored server-side per student (Phase 22+)
- Visible only to the student by default
- Shareable via a signed attestation (student generates a one-time verifiable token)
- Accessible to prop firms or institutions only with student's explicit, revokable consent
- Never sold, aggregated without anonymization, or used for advertising

### 3.4 The Behavioral Moat

The behavioral data produced by TecPey compounds over time:
- More students → richer behavioral patterns → better personalization models
- Better personalization → higher graduation rates → stronger brand
- Stronger brand → more institutional partnerships → more Enterprise SaaS revenue
- More Enterprise SaaS revenue → more investment in curriculum and AI → better outcomes

This is a defensible advantage. The data is not raw — it is structured behavioral intelligence that takes years to accumulate.

---

## Section 4 — The Academy

### 4.1 Curriculum Philosophy

TecPey Academy is not a video library. It is a structured learning path with a defined competency framework.

A student who completes all 7 terms has demonstrated:
- Foundational financial literacy (what money is, how markets work, what crypto is)
- Risk awareness (what can go wrong and why)
- Trading mechanics (order types, position sizing, portfolio management)
- Behavioral competence (discipline, FOMO resistance, loss management)
- Market analysis foundations (technical and fundamental)
- Simulator competence (scenario passing in behavioral simulator)
- Community accountability (study group participation, peer journal sharing)

### 4.2 Curriculum Structure

```
Term 1 — Financial Foundations
Term 2 — Crypto Fundamentals
Term 3 — Risk & Security
Term 4 — Market Analysis
Term 5 — Trading Psychology
Term 6 — Practical Trading Mechanics
Term 7 — Integration & Mastery
```

Each term contains:
- Lessons (text + interactive elements)
- Quizzes (spaced repetition, not single-pass)
- Practical scenarios (Trading Arena integration)
- Reflection prompts (journal integration)
- Term certificate (upon completion + behavioral threshold)

### 4.3 Certificate Verification

Every TecPey certificate is:
- Issued with a unique ID
- Publicly verifiable at `tecpey.ir/verify/{certificateId}`
- Anchored (hash stored in an append-only log)
- Employer-readable via API (`GET /api/v1/trust/verify/{id}`)

Certificates cannot be purchased, accelerated through gaming, or issued without genuine completion. The certificate includes the student's Trading DNA snapshot at the time of issuance.

---

## Section 5 — Multi-Tenant & Enterprise Architecture

### 5.1 Tenant Model

TecPey is a multi-tenant SaaS platform. Each tenant is an isolated deployment of TecPey's infrastructure:

- A university deploys TecPey under its own brand
- A prop firm deploys TecPey for candidate assessment
- A financial institution deploys TecPey for employee training
- A government body deploys TecPey for national financial literacy programs

Each tenant's data is isolated at the database level. Tenants cannot see each other's data under any circumstances.

### 5.2 White-Label Architecture

A white-label tenant can:
- Replace TecPey branding with their own (logo, colors, typography)
- Use a custom domain (`education.mybank.com`)
- Customize the curriculum (add content, restrict terms)
- Configure AI model selection
- Use their own API key for AI services
- Receive student data in their own format via API

What cannot be white-labeled (platform integrity constraints):
- The Educational Constitution (quality standards)
- The anti-profit-ranking principle (leaderboards cannot rank by P&L)
- The privacy-first defaults
- The responsible trading disclaimers

### 5.3 Pricing Model (Architecture, Not Implementation)

| Tier | Target | Includes |
|---|---|---|
| Free | Individual students | Full Academy access, 1 device, public certificate |
| Pro | Serious learners | Multi-device sync, advanced DNA analysis, priority mentor |
| Enterprise | Institutions | White-label, API access, custom curriculum, SLA, analytics |
| White Label | Full rebranders | Custom domain, full brand override, dedicated support |

---

## Section 6 — Developer Platform

### 6.1 API Design Principles

TecPey's public API is:
- RESTful with consistent resource naming
- Versioned (`/api/v1/`, `/api/v2/`)
- Documented via OpenAPI 3.1 (auto-generated from Zod schemas)
- Authenticated via OAuth 2.0 or API key
- Rate-limited per tenant and per endpoint

### 6.2 Use Cases

**Prop firms:** Pull candidate DNA scores for hiring assessment (with candidate consent JWT).

**Universities:** Bulk student enrollment, progress export, certificate verification.

**EdTech platforms:** Embed TecPey courses via LTI or API in a host LMS.

**HR platforms:** Verify certificates and pull verified credentials for employee records.

**Financial tools:** Trigger mentor sessions based on real account behavior (with user consent).

### 6.3 Plugin Architecture (Phase 24+)

Third parties can build plugins that:
- Add new lesson formats
- Add new behavioral dimension scorers
- Add new challenge types
- Add new leaderboard categories
- Add new financial product types to the Financial Ecosystem

Plugins are sandboxed, reviewed, and published via the Plugin Marketplace.

---

## Section 7 — Social & Reputation Layer

### 7.1 What This Is (and Is Not)

The TecPey Social Layer is not a social network. It is a structured accountability system.

**It is NOT:**
- A chat platform
- A trading signals network
- A profit-sharing community
- A forum for speculation

**It IS:**
- A discipline leaderboard (ranked by behavior, not P&L)
- A weekly challenge system (behavioral targets)
- A study group matching system (interest-based, no DMs)
- A peer journal system (anonymous, sanitized, opt-in)
- A mentor review layer (consent-gated instructor dashboard)

### 7.2 Reputation Model

TecPey reputation is built from:
- Completing Academy terms (verifiable)
- Behavioral DNA scores (computed, not gamed)
- Challenge completions (behavior-verified)
- Peer journal contributions (quality-reviewed)
- Community tenure (account age + engagement consistency)

Reputation cannot be purchased. It cannot be transferred. It cannot be inflated by volume.

### 7.3 Community Safety Architecture

The seven community safety rules are embedded at the infrastructure level, not just in UI text:

1. No profit results sharing (API returns 400 for any community post containing financial result claims)
2. No investment advice (content moderation flagging)
3. No profit claim (moderation)
4. No external service promotion (moderation)
5. No personal financial data requests (moderation)
6. No harassment (moderation)
7. Education only (platform purpose statement displayed on all community pages)

---

## Section 8 — Compliance & Trust

### 8.1 Education-First Positioning

TecPey Academy operates as an educational institution. It provides information and behavioral training. It does not provide:
- Investment advice
- Asset recommendations
- Price predictions
- Financial planning services

This framing is consistent across all jurisdictions and significantly reduces regulatory risk.

### 8.2 Data Residency Architecture

| Region | Data Residency Strategy |
|---|---|
| Iran (Phase 1) | Iran-accessible infrastructure |
| UAE (Phase 2) | UAE-based infrastructure (VARA compliance) |
| EU (Phase 3) | EU-based infrastructure (GDPR compliance) |
| Global (Phase 3+) | Tenant-configurable data residency |

Tenants can specify the geographic region where their data is stored. This is a configuration, not a rebuild.

### 8.3 Audit & Compliance Architecture

Every state-changing operation on regulated data generates an immutable audit log entry. Audit logs are:
- Stored separately from operational data
- Retained for 7 years minimum
- Exportable for regulatory review
- Cryptographically signed (tamper-evident)

---

## Section 9 — Technology Stack

### 9.1 Current Stack (Phase 18)

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, RSC), Tailwind CSS |
| Language | TypeScript |
| Database | PostgreSQL |
| AI | Anthropic Claude (via REST API) |
| Auth | JWT (jose), httpOnly cookies |
| Rate Limiting | Redis (Upstash REST API) + in-memory fallback |
| Hosting | Nginx + PM2 (Ubuntu 24) |
| CI | GitHub Actions |

### 9.2 Target Stack (Phase 24+)

| Layer | Technology / Decision |
|---|---|
| Frontend | Next.js (LTS), Tailwind CSS |
| Language | TypeScript |
| Database | PostgreSQL (primary) + read replica |
| Database migrations | Custom migration runner (numbered SQL files) |
| AI | Anthropic Claude via AI Gateway service (internal) |
| Auth | Unified JWT (jose), OAuth 2.0 |
| Rate Limiting | Redis (required in production) |
| Background jobs | Message queue (BullMQ or equivalent) |
| Logging | Pino (structured JSON) |
| Error monitoring | Sentry |
| Observability | Prometheus + Grafana (or equivalent) |
| CDN | Cloudflare |
| Object storage | S3-compatible (certificates, exports) |

---

## Section 10 — Long-Term Strategy

### 10.1 The 5-Year Horizon (2026–2031)

| Year | Milestone |
|---|---|
| 2026 | Iran Phase 1 complete: 100k enrolled students, 10k certificates |
| 2027 | Enterprise V1: 5+ institutional tenants, prop firm partnerships |
| 2028 | Arabic market entry, Developer Platform live, 1k API integrations |
| 2029 | Southeast Asia expansion, 1M total enrolled students |
| 2030 | Regulated financial products in UAE, Developer Marketplace live |
| 2031 | Global leadership in behavioral financial education |

### 10.2 What Does Not Change

Regardless of scale, market, or business model evolution, these principles are permanent:

1. Education before monetization
2. Behavioral data belongs to the student
3. Profit ranking is forbidden in community contexts
4. Privacy-first defaults
5. No profit promises, ever
6. Honest, responsible, no-dark-patterns UX

---

*Whitepaper Structure v2.0 — Phase 19. This is an architectural document, not investment material.*
