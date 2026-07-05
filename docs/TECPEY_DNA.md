# TecPey DNA — Core Identity Document

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Official — single source of truth for TecPey identity
**Supersedes:** All prior identity/product definitions in `PROJECT_MASTER_STATUS.md`, `README.md` product sections

---

## 1. What TecPey Is

TecPey یک پلتفرم آموزش مالی دیجیتال و زیرساخت Enterprise SaaS است.

TecPey is a **Digital Financial Education Platform** and **Enterprise SaaS infrastructure** for financial literacy, behavioral trading competence, and responsible market access.

**نام کامل / Full Name:** TecPey (تک‌پی)
**شرکت / Entity:** TechnoPardakht — Babol, Mazandaran, Iran
**دفتر / Office:** Phone +98 11 3233 8026 | Email info@tecpey.ir
**وب‌سایت / Website:** [tecpey.ir](https://tecpey.ir)
**صرافی / Exchange:** [my.tecpey.ir](https://my.tecpey.ir)

---

## 2. The Core Thesis

> Most people who enter financial markets do so without adequate preparation.
> The consequences are devastating — both financially and psychologically.
> TecPey exists to close that gap.

The measure of TecPey's success is not user count, trading volume, or revenue.
The measure is:
- **Graduation rate** — students who complete Term 1 through Term 7
- **Behavioral improvement** — measurable improvement in Trading DNA dimensions over time
- **Return rate** — students who use TecPey for 12+ months
- **Employment outcomes** — students placed in prop firms, financial institutions, or independent trading

---

## 3. The Five Components

TecPey is **not** an exchange with an education section. It is a **safe crypto market entry ecosystem** with five equal components:

| # | Component | URL | Purpose |
|---|-----------|-----|---------|
| 1 | **TecPey Exchange** | `my.tecpey.ir` | Live prices, buy/sell BTC/USDT/ETH/30+ coins. Transparent fees. |
| 2 | **TecPey Academy** | `tecpey.ir/academy` | Free structured 7-term crypto education with certificates. |
| 3 | **TecPey AI Mentor** | `tecpey.ir/academy` (widget) | Personalized AI coach with behavioral performance context. |
| 4 | **TecPey Trading Arena** | `tecpey.ir/academy` (module) | Virtual risk-free simulation with full analytics and journal. |
| 5 | **TecPey Knowledge Center** | `tecpey.ir/learn` | Crypto glossary, articles, beginner explainers. |

---

## 4. The Twelve Pillars

| # | Pillar | Definition |
|---|--------|------------|
| 1 | **Exchange** | Market access layer: live prices, buy/sell, swaps, portfolio view |
| 2 | **Academy** | Structured learning: 7-term curriculum, quizzes, certificates, spaced repetition |
| 3 | **Financial Ecosystem** | Products beyond spot trading: savings plans, investment clubs, compliant lending |
| 4 | **Social & Reputation Layer** | Privacy-first community: discipline leaderboards, peer journals, study groups |
| 5 | **AI Operating System** | Cross-pillar intelligence: Mentor AI, Support AI, Admin AI, Trading AI |
| 6 | **Developer Platform** | SDK, public API, webhooks, OAuth, plugin marketplace |
| 7 | **Enterprise SaaS** | Subscription tiers, billing, SLAs, enterprise contracts |
| 8 | **Multi-Tenant Infrastructure** | Tenant isolation, per-tenant config, white-label deployment |
| 9 | **White Label System** | Full rebrand capability: fonts, colors, domains, content |
| 10 | **Analytics & Intelligence** | Aggregate behavioral data, cohort analysis, platform insights |
| 11 | **Trust & Verification** | Certificate verification, identity proofing, anti-scam system |
| 12 | **Governance & Compliance** | Regulatory compliance per jurisdiction, audit trails, data residency |

---

## 5. Brand Slogan

> **تک‌پی، نقطه امن ورود به بازار رمزارز**
>
> **TecPey — the safe entry point to the crypto market.**

### Secondary Tagline

> آموزش اول. امنیت همیشه. ورود مسئولانه به بازار.
>
> Education first. Security always. Responsible market access.

---

## 6. Core UX Principles (Permanent)

1. **Two Equal Paths** — Home page always presents `ورود به صرافی` (exchange) and `آکادمی رایگان` (academy) as equally weighted CTAs.
2. **Mobile Sticky Bottom Bar** — Both CTAs side by side on mobile. Neither may be hidden or reduced.
3. **Exchange CTA Sub-label** — Always show: "برای شروع مطمئن، آکادمی کنار توست."
4. **Safe Wording** — Never promise profit. Never describe as financial advisor. Use "education," "simulated practice," "risk awareness," "informed decision-making," "safer onboarding."

---

## 7. What TecPey Will Never Be

These are hard constraints, not aspirational:

1. **Never a profit-promise platform** — No guarantee of returns. No signal services.
2. **Never a surveillance platform** — Behavioral data belongs to the student.
3. **Never a gambling wrapper** — Trading Arena is a simulator, not a gambling tool.
4. **Never a closed system** — Data export always available.
5. **Never a dark pattern platform** — No hidden fees, no manipulative urgency.

---

## 8. Technology Identity

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router, RSC, Turbopack) |
| **Language** | TypeScript 5 (strict mode) |
| **Styling** | Tailwind CSS 4, custom enterprise design tokens |
| **Database** | PostgreSQL 16 via custom ORM layer |
| **Cache/Queue** | Redis 7 (BullMQ, pub/sub, rate limiting) |
| **Auth** | JWT (jose), httpOnly cookies, CSRF protection, WebAuthn, TOTP |
| **AI** | Claude API (Anthropic) — AI Mentor |
| **Charts** | TradingView + Chart.js + Recharts (see [[CHART_STACK_CONSOLIDATION]]) |
| **Deployment** | Docker, PM2, systemd, Nginx, Ubuntu 24 LTS |
| **CI** | GitHub Actions |

---

## 9. Language Identity

- **Primary language:** Persian (fa-IR) — RTL layout
- **Secondary language:** English (en-US) — LTR via `/en` subtree
- **Future languages:** Arabic (ar), Dari (prs) — planned
- **Locale strategy:** `next-intl`, single root for Persian, `/en` subtree for English

---

## 10. Version History

| Version | Date | Summary |
|---------|------|---------|
| v1.0 | 2025 | "Safe crypto market entry" — exchange + academy |
| v1.5 | Phase 14 | Academy as primary product; exchange as one of five |
| v2.0 | Phase 19 (2026-06-28) | Enterprise SaaS platform, 12 pillars, behavioral moat |
| v3.0 | Phase 39.5 (2026-07-05) | Strategic freeze, documentation synchronization, launch-mode hardening |

---

*این سند هویت تک‌پی را تعریف می‌کند. هر تصمیم محصول باید با این اصول سازگار باشد.*
*This document defines TecPey's identity. Every product decision must be consistent with these principles.*
