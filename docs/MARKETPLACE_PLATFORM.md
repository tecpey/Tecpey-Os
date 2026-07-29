# TecPey Marketplace — بازار تک‌پی

**Date:** 2026-07-05
**Phase:** 39.5 — Strategic Freeze & TecPey DNA Synchronization
**Status:** Official — Permanent Marketplace Architecture
**Classification:** Internal — Strategic Product Architecture

---

## ۱. مقدمه / Introduction

TecPey Marketplace is a multi-vendor digital marketplace where creators, developers, educators, and institutions publish, sell, and distribute products and services built on or integrated with the TecPey platform.

The Marketplace is not a separate website — it is an embedded layer within the TecPey ecosystem, accessible from the Academy, Exchange, Trading Arena, and White-Label deployments.

بازار تک‌پی، اکوسیستم اقتصاد خالقان و توسعه‌دهندگان پلتفرم است.

---

## 2. Marketplace Categories

### 2.1 AI Marketplace

| Product | Description | Creator | Revenue Model |
|---------|-------------|---------|---------------|
| AI Personas | Custom AI Mentor personalities (e.g., "Warren Buffett Mentor") | Developers, psychologists | Sale + commission |
| AI Knowledge Packs | Domain-specific knowledge loaded into AI Mentor | Educators, experts | Sale + commission |
| AI Evaluation Scripts | Custom assessment algorithms | Data scientists | Sale + commission |
| AI Prompts | Pre-built prompt templates for Mentor AI | Prompt engineers | Sale + commission |

### 2.2 Mentor Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| Mentor Courses | Structured learning paths taught by human mentors | Certified mentors |
| Live Sessions | 1-on-1 or group mentoring sessions | Certified mentors |
| Mentor Content | Video lessons, study guides, practice sets | Educators |
| Mentor Evaluation | Custom skill assessments | Industry experts |

### 2.3 Strategy Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| Trading Strategies | Documented trading strategies with rules | Traders, analysts |
| Backtest Reports | Verified backtest results for strategies | Quantitative analysts |
| Strategy Templates | Customizable strategy frameworks | Trading educators |
| Risk Management Plans | Structured risk frameworks | Risk managers |

### 2.4 Indicator Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| TradingView Indicators | Custom Pine Script indicators | Developers |
| Custom Oscillators | Proprietary technical indicators | Analysts |
| Dashboard Widgets | Real-time analysis dashboards | Developers |
| Alert Systems | Custom price/volume alert configurations | Traders |

### 2.5 Signal Marketplace

| Product | Description | Creator | Restriction |
|---------|-------------|---------|-------------|
| Educational Signals | Market analysis for educational purposes | Analysts | No profit claims |
| Alert Services | Customizable price/volume alerts | Developers | No buy/sell calls |
| Sentiment Analysis | Aggregated market sentiment data | Data providers | Educational only |
| Macro Reports | Economic and market analysis | Economists | Educational only |

**⚠️ Hard Constraint:** The Signal Marketplace is **educational only**. No profit promises, no guaranteed returns, no "calls." Strict moderation enforced by Marketplace AI and human reviewers.

### 2.6 Trading Bot Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| Bot Scripts | Automated trading strategies (paper trading only unless licensed) | Developers |
| Bot Templates | Customizable bot frameworks | Developers |
| Backtesting Engines | Strategy testing tools | Quantitative devs |
| Bot Analytics | Performance monitoring dashboards | Developers |

**⚠️ Hard Constraint:** Trading Bots are paper-trading only by default. Real-money bot trading is a licensed feature requiring KYC, risk assessment, and compliance approval.

### 2.7 Prompt Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| AI Mentor Prompts | Pre-built prompts for specific learning goals | Educators |
| Tutor Scripts | Prompt chains for structured tutoring | Instructional designers |
| Assessment Prompts | Quiz and evaluation generation prompts | Teachers |
| Scenario Prompts | Trading scenario descriptions for the Arena | Scenario designers |

### 2.8 Template Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| Trading Journal Templates | Structured journal formats | Traders, psychologists |
| Study Plan Templates | Structured learning schedules | Educators |
| Risk Plan Templates | Position sizing and risk management frameworks | Risk managers |
| Portfolio Templates | Asset allocation and portfolio structures | Financial planners |

### 2.9 Plugin Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| Academy Plugins | Custom lesson types, interactive elements | Developers |
| Trading Plugins | Custom order types, analysis tools | Developers |
| Community Plugins | Custom challenge types, group features | Developers |
| Dashboard Plugins | Custom widgets for student dashboard | Developers |
| White-Label Plugins | Tenant-specific customizations | Enterprise developers |

### 2.10 Developer Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| API Wrappers | Language-specific SDKs and wrappers | Developers |
| Integration Connectors | Pre-built integrations (TradingView, MetaTrader, etc.) | Developers |
| Webhook Templates | Event-driven automation templates | Developers |
| Code Libraries | Reusable code for TecPey platform development | Developers |

### 2.11 API Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| Data APIs | Market data, historical data, on-chain data | Data providers |
| Analysis APIs | Technical indicators, sentiment analysis | Algorithm providers |
| Compliance APIs | KYC/AML checks, sanctions screening | Compliance providers |
| Notification APIs | SMS, email, push notification integrations | Communication providers |

### 2.12 Automation Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| Trading Automations | Conditional trade execution workflows | Developers |
| Learning Automations | Scheduled study plans, quiz reminders | Educators |
| Report Automations | Scheduled progress/performance reports | Analysts |
| Compliance Automations | Automated compliance check workflows | Compliance officers |

### 2.13 Education Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| Full Courses | Structured multi-lesson courses | Educators, institutions |
| Mini-Courses | Focused single-topic courses | Individual educators |
| Workbooks | Printable or interactive practice materials | Content creators |
| Study Groups | Facilitated group learning programs | Community leaders |

### 2.14 Premium Content Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| Research Reports | In-depth market analysis | Analysts, researchers |
| Video Courses | Professional video-based learning | Production teams |
| eBooks | Digital books on trading, finance, psychology | Authors |
| Webinars | Live and recorded educational events | Industry experts |

### 2.15 White-Label Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| White-Label Courses | Pre-built courses for tenant deployment | Content studios |
| Tenant Templates | Branded deployment templates | Design agencies |
| Localization Packs | Language/region-specific content packs | Localization experts |
| Compliance Packs | Jurisdiction-specific compliance content | Legal experts |

### 2.16 Business Services Marketplace

| Service | Description | Provider |
|---------|-------------|----------|
| Consulting | Financial education strategy consulting | Industry experts |
| Training | Team/group training programs | Certified trainers |
| Auditing | Platform compliance and security audits | Security firms |
| Localization | Content translation and cultural adaptation | Localization agencies |

### 2.17 Certification Marketplace

| Product | Description | Creator |
|---------|-------------|---------|
| Certification Exams | Proctored exam sessions | Testing centers |
| Certification Prep | Study materials for TecPey exams | Educators |
| Recertification | Renewal courses for expired certifications | Content creators |
| Specialized Badges | Niche skill verification assessments | Industry bodies |

---

## 3. Publishing Workflow

```
Creator submits product
    ↓
Automated quality checks (AI-powered)
    ├── Malware scan
    ├── Plagiarism check
    ├── Compliance review (no profit claims, no prohibited content)
    └── Format validation
    ↓
Human review (for paid products)
    ↓
Publishing decision
    ├── Approved → Listed in marketplace
    ├── Rejected → Reason provided, resubmission allowed
    └── Flagged → Manual review required
```

### 3.1 Review Time Targets

| Product Type | Automated Review | Human Review | Total |
|-------------|-----------------|--------------|-------|
| Free templates | < 1 hour | — | < 1 hour |
| Paid indicators | < 1 hour | < 24 hours | < 25 hours |
| Trading bots | < 1 hour | < 48 hours | < 49 hours |
| Courses | < 1 hour | < 72 hours | < 73 hours |
| Plugins | < 1 hour | < 48 hours (security review) | < 49 hours |
| Business services | < 1 hour | < 1 week | < 8 days |

---

## 4. Quality Control

| Dimension | Check | Automated | Human |
|-----------|-------|-----------|-------|
| **Functionality** | Does the product work as described? | ⚠️ Partial | ✅ |
| **Security** | Does the product access unauthorized data? | ✅ Malware scan | ✅ Code review |
| **Compliance** | Does the product violate platform policies? | ✅ AI moderation | ✅ |
| **Originality** | Is the product original or plagiarized? | ✅ Plagiarism check | ⚠️ Sample check |
| **Documentation** | Is the product adequately documented? | ⚠️ Format check | ✅ |
| **Performance** | Does the product perform adequately? | ⚠️ Benchmark | — |
| **Educational Value** | Does the product teach something valid? | — | ✅ |

---

## 5. Revenue Sharing

| Product Category | Creator Share | TecPey Share | Notes |
|-----------------|--------------|-------------|-------|
| AI Products | 75% | 25% | — |
| Courses & Education | 80% | 20% | — |
| Indicators & Strategies | 70% | 30% | — |
| Trading Bots | 65% | 35% | Higher moderation cost |
| Templates | 80% | 20% | — |
| Plugins | 70% | 30% | — |
| Signals (Educational) | 75% | 25% | Strict compliance |
| Business Services | 85% | 15% | Low platform cost |
| Certifications | 60% | 40% | Verification cost |
| White-Label Products | 70% | 30% | Per-deployment license |

**White-Label Tenants** who run their own marketplace can set their own revenue share (minimum 50% creator).

---

## 6. Payments & Subscriptions

| Model | Description | Platform Fee |
|-------|-------------|-------------|
| **One-Time Purchase** | Single payment, lifetime access | Per transaction |
| **Subscription** | Monthly/annual recurring | Per billing cycle |
| **Rental** | Time-limited access (e.g., 30 days) | Per rental |
| **Pay-per-Use** | Usage-based billing (e.g., per API call) | Per usage unit |
| **Freemium** | Free tier + paid upgrade | On upgrade |
| **Donation** | Voluntary payment to creator | 5% platform fee |

### 6.1 Payment Processing

| Method | Support | Payout Timeline |
|--------|---------|----------------|
| Platform credit | ✅ Instant | N/A |
| Cryptocurrency | ⚠️ Planned (Phase 50+) | Instant |
| Bank transfer | ✅ (Iranian banks) | 2-5 business days |
| International wire | ⚠️ Planned | 5-10 business days |

---

## 7. Licensing

Each marketplace product has a license type that defines usage rights:

| License | Usage Rights | Price Impact |
|---------|-------------|--------------|
| **Personal** | Single user, non-commercial | Lowest |
| **Professional** | Single user, commercial use | Medium |
| **Team** | Up to 10 users within one organization | Higher |
| **Enterprise** | Unlimited users within one organization | Highest |
| **Site License** | Unlimited users, unlimited deployments | Custom |
| **OEM** | Embedded in another product | Custom |

---

## 8. Moderation & Trust

### 8.1 Prohibited Content

| Category | Examples | Action |
|----------|----------|--------|
| Profit promises | "Make 1000% per month" | Immediate removal + creator suspension |
| Investment advice | "Buy this coin now" | Removal + warning |
| Plagiarized content | Copied from other platforms or creators | Removal + penalty |
| Malware | Code with hidden malicious behavior | Permanent ban + report |
| Misinformation | Factually incorrect financial claims | Removal + correction required |

### 8.2 Creator Reputation

| Score | Range | Meaning | Benefits |
|-------|-------|---------|----------|
| Platinum | 4.8-5.0 | Top creator | Featured listings, 80% revenue share |
| Gold | 4.5-4.7 | Trusted creator | Priority support, 75% revenue share |
| Silver | 4.0-4.4 | Established creator | Standard terms |
| Bronze | 3.0-3.9 | New creator | Standard terms, manual review |
| Risky | < 3.0 | Probation | 50% revenue hold, manual review all listings |

---

## 9. Ranking & Search

| Factor | Weight | Description |
|--------|--------|-------------|
| Relevance | 30% | Keyword match to search query |
| Quality Score | 25% | Average rating + review quality |
| Sales Velocity | 20% | Recent sales trend (not total) |
| Creator Reputation | 15% | Creator's platform history |
| Newness Boost | 10% | Temporary boost for new products (7 days) |

---

## 10. Fraud Prevention

| Measure | Description | Automation |
|---------|-------------|------------|
| Fake purchase detection | Flag rapid purchases from same IP | ✅ AI |
| Review fraud detection | Identify fake 5-star reviews | ✅ AI |
| Content plagiarism | Cross-platform plagiarism check | ✅ AI |
| Malware scanning | Automated code analysis | ✅ Automated |
| Creator identity verification | KYC for paid product creators | ⚠️ Manual |
| Refund abuse monitoring | Track excessive refund requests | ✅ AI |

---

## 11. Implementation Phases

| Phase | Marketplace Milestone | Dependencies |
|-------|----------------------|--------------|
| 48 | 🚧 Marketplace V1 — Core infrastructure, listings, purchases | Phase 44 (Multi-Tenant) |
| 48 | 🚧 AI + Mentor + Education categories | Phase 48 marketplace infra |
| 49 | 🚧 Marketplace AI — recommendations, moderation, quality scoring | Phase 49 AI OS |
| 50 | 🚧 Strategy + Indicator + Signal categories | Phase 48 marketplace infra |
| 50 | 🚧 Plugin + Developer + API categories | Phase 48 + Phase 24 (Dev Platform) |
| 50 | 🚧 Trading Bot category (paper trading) | Phase 48 marketplace infra |
| 50+ | 🚧 White-Label + Business Services categories | Phase 44 tenant infra |
| 50+ | 🚧 Certification marketplace | Phase 29 (Trust & Verification) |

---

## 12. Strategic Value

| Benefit | Description |
|---------|-------------|
| **Ecosystem Lock-in** | Creators build on TecPey, attracting more users |
| **Revenue Diversification** | Beyond exchange fees — commissions, subscriptions, licensing |
| **Content Scale** | Thousands of products without internal content team |
| **Community Engagement** | Creators become platform advocates |
| **White-Label Value** | Tenants get a pre-populated marketplace |
| **Data Moat** | Marketplace interaction data improves AI recommendations |

---

*این سند، معماری بازار تک‌پی را تعریف می‌کند. اکوسیستم اقتصاد خالقان و توسعه‌دهندگان.*
*This document defines the TecPey Marketplace architecture. The creator and developer economy ecosystem.*
