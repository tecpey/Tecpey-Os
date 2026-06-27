# TecPey — Global Expansion Strategy

**Phase 14 Strategic Document**
**Version:** 1.0
**Date:** 2026-06-27
**Status:** Implementation-Ready

---

## Strategic Vision

TecPey begins where it is most needed and where it can be most authentic: Iran. It grows where its educational philosophy resonates: the Middle East and Persian-speaking diaspora. It scales where its model is proven: globally.

This is not a geographic rollout plan. It is a mission expansion plan. Each phase is entered only when the prior phase is genuinely excellent — not merely launched.

---

## Phase 1 — Iran (فاز اول — ایران)

### 1.1 Phase Definition

Iran is the founding market. All Academy content, all product design, all trust-building, and all community development happens here first.

Phase 1 is complete when:
- 100,000 enrolled Academy students
- 10,000 Term 1 certificates issued
- 1,000 Term 3+ certificates issued
- Net Promoter Score ≥ 50 (measured via in-platform survey)
- AI Mentor achieves 80%+ satisfaction rating
- Product is stable and scalable

### 1.2 Iran Market Context

**Unique challenges:**
- Sanctions restrict access to global payment infrastructure
- Internet censorship requires VPN-resilient architecture
- Regulatory environment is uncertain — education-first positioning reduces risk
- High inflation makes financial education urgently relevant
- Currency volatility creates strong demand for USD-denominated assets and education about them

**TecPey's response:**
- Education is free — no payment barrier
- Rial-denominated examples where relevant
- Content addresses Iran-specific regulatory context explicitly and honestly
- Technical architecture optimized for low-bandwidth and intermittent connectivity

### 1.3 Iran Content Priorities

1. **Persian-native writing.** Not translated from English. Written by Iranian financial educators.
2. **Iran-relevant examples.** Price comparisons in Toman. Scenarios from Iranian investment behavior.
3. **Regulatory transparency.** Honest coverage of the legal landscape for crypto in Iran.
4. **Trust through education.** Before any trading topic, security and scam prevention.

### 1.4 Iran Distribution Strategy

- Organic SEO in Persian (primary)
- Telegram community (Iran's dominant messaging platform)
- Partnership with Iranian universities for financial literacy integration
- Word of mouth through Academy community
- Verified certificate as social proof on LinkedIn and resume

---

## Phase 2 — Middle East & Persian-Speaking World (فاز دوم — خاورمیانه)

### 2.1 Target Markets

**Priority markets (in order):**
1. Afghanistan (Dari — closely related to Persian, shared cultural context)
2. Tajikistan (Tajik Persian)
3. UAE (Iranian diaspora, large crypto-active population)
4. Turkey (large Iranian diaspora; strategic for distribution)
5. Iraq (Arabic, but significant Persian-speaking population)
6. Arabic-speaking markets: Saudi Arabia, Egypt, Kuwait, Jordan

### 2.2 Phase 2 Readiness Criteria

- Phase 1 NPS ≥ 60
- Product fully stable and documented
- Dedicated localization team hired
- Partnership or community established in each target market

### 2.3 Language Expansion

| Language | Market | Type | Phase |
|----------|--------|------|-------|
| Persian (fa-IR) | Iran | Native | 1 |
| Dari (fa-AF) | Afghanistan | Dialect adaptation | 2 |
| Tajik (tg-TJ) | Tajikistan | Dialect adaptation | 2 |
| Arabic (ar) | MENA | Full translation + adaptation | 2 |
| English (en) | Diaspora + global | Already developed | 1 |
| Turkish (tr) | Turkey | Full translation + adaptation | 2 |

### 2.4 Arabic Localization Requirements

Arabic is structurally RTL like Persian, but differences are significant:
- Different financial vocabulary (no direct Persian-to-Arabic terminology mapping)
- Different regulatory context per country (Saudi Arabia, UAE, Egypt each differ)
- Islamic finance considerations are more prominent in Arabic markets (halal investment discussion must be substantive, not superficial)
- Different trust references and authority sources

Arabic content must be written by native Arabic financial educators — not translated from Persian.

### 2.5 UAE Opportunity

UAE is a strategic base for Phase 2 because:
- Largest Persian-speaking diaspora outside Iran
- Crypto-friendly regulatory environment (VARA)
- Financial literacy is a recognized need
- English-Arabic bilingual content has direct market fit
- UAE-based users can access global payment infrastructure

---

## Phase 3 — Global (فاز سوم — جهانی)

### 3.1 Target Markets

Phase 3 targets markets where:
- Crypto adoption is growing rapidly
- Financial literacy infrastructure is weak
- English content is accessible
- AI-assisted education is valued

**Priority regions:**
- Southeast Asia (Indonesia, Vietnam, Philippines, Thailand)
- South Asia (Pakistan, Bangladesh — Urdu as a medium-term expansion)
- East Africa (Nigeria, Kenya — English + local context)
- Latin America (Brazil — Portuguese, Mexico/Colombia — Spanish)

### 3.2 Phase 3 Readiness Criteria

- Phase 2 markets generating measurable graduation rates
- Revenue model validated in Phase 2
- Technology infrastructure scalable to 1M concurrent users
- Localization team with native educators in each Phase 3 market

### 3.3 Global Language Architecture

**The TecPey Language Principle:** No language is launched until native educators (not translators) have produced original content for that market. Machine translation is never used for lesson content.

**Language priority matrix:**
```
Phase 1: Persian (fa-IR) + English (en)
Phase 2: Dari + Tajik + Arabic + Turkish
Phase 3: Indonesian + Portuguese + Spanish + Urdu
Beyond: Vietnamese + Swahili + French (Africa)
```

---

## Part 4 — RTL and LTR Architecture

### 4.1 Current State

TecPey is built with RTL-first architecture:
- Root layout is RTL (fa-IR)
- English content uses EnglishShell wrapper for LTR rendering
- All UI components tested in both directions

### 4.2 Multi-Language Architecture Requirements

For Phase 2+, the architecture must support:
- Language switching without full page reload
- RTL ↔ LTR direction per user language setting
- Mixed-language content (technical terms that remain in English within Persian text)
- Number formatting by locale (Persian numerals vs Arabic-Indic numerals vs Western)
- Date formatting by locale (Jalali calendar vs Hijri vs Gregorian)

### 4.3 Font Strategy

| Language | Font | Notes |
|----------|------|-------|
| Persian | IRANYekanX | Current. Variable weights available. |
| Arabic | Cairo or Noto Naskh Arabic | To be evaluated |
| Turkish | Inter | Same as English (Latin script) |
| Indonesian | Inter | Same as English (Latin script) |
| Dari/Tajik | IRANYekanX (Dari) / Cyrillic font (Tajik) | Requires evaluation |

---

## Part 5 — Localization Standards

### 5.1 What Localization Means at TecPey

Localization is not translation. It is cultural reconstruction. The same educational goal is achieved through content written for the target culture, with:
- Locally relevant examples
- Locally relevant regulatory context
- Locally recognized authority references
- Locally appropriate tone and formality

### 5.2 Localization Process

For each new market:
1. Market Research (90 days before launch): financial literacy landscape, competitor analysis, regulatory context, trust signals, distribution channels
2. Native Educator Recruitment: minimum 1 senior financial educator per language
3. Curriculum Adaptation: core curriculum framework preserved; examples, scenarios, and regulatory content rewritten for market
4. Community Seed: establish local community (Telegram, WhatsApp, Discord) before public launch
5. Soft Launch (pilot): 500-student beta with feedback collection
6. Iteration: 30–60 days of feedback incorporation
7. Public Launch

### 5.3 Content That Is Never Adapted

The following content is universal and is not changed per locale:
- TecPey Academy Educational Constitution (standards apply globally)
- Trading DNA Model (behavioral dimensions are universal)
- Responsible trading principles
- Ethical standards and fraud prevention

---

## Part 6 — Cultural Adaptation

### 6.1 Iranian Market Cultural Profile

| Dimension | Iranian Cultural Context | TecPey Application |
|-----------|------------------------|-------------------|
| Trust | High distrust of institutions; peer trust is high | Certify peer mentors; build visible community |
| Authority | Expertise respected when demonstrated | Expert-authored content with credentials visible |
| Risk attitude | Variable; high financial anxiety post-2018 devaluation | Emphasize risk management before trading |
| Islamic finance | Significant for some users; not universal | Address riba and halal concepts explicitly but not exclusively |
| Privacy | High concern with data privacy | Transparent data practices; no government data sharing |
| Language formality | Semi-formal preferred in education | Use "تو" not "شما" in AI Mentor; formal in official content |

### 6.2 Arabic Market Cultural Profile

| Dimension | Arabic Cultural Context | TecPey Application |
|-----------|------------------------|-------------------|
| Trust | Community and family referrals are highest trust | Referral-led growth strategy |
| Islamic finance | Dominant consideration in GCC markets | Halal investment module as a first-class curriculum item |
| Authority | Academic and religious authority carry weight | Credential display prominent; include Islamic finance scholar review |
| Language | Modern Standard Arabic vs colloquial varies greatly | Use MSA for written content; acknowledge dialect diversity |

---

## Part 7 — Trust Building Strategy

### 7.1 Trust Layers

TecPey builds trust through four layers:

**Layer 1 — Educational Trust**
The Academy content is high-quality, honest, and responsible. It does not promise profits. It teaches risk. It earns trust by being genuinely useful.

**Layer 2 — Verification Trust**
Certificates are publicly verifiable. Trading DNA scores are transparent. There is nothing to hide.

**Layer 3 — Community Trust**
Other students vouch for the platform through visible progress, public profiles, and shared certificates.

**Layer 4 — Institutional Trust**
Partnerships with universities, financial education bodies, and prop firms provide third-party validation.

### 7.2 Anti-Trust Patterns to Avoid

- Overpromising: Never promise profit outcomes or career guarantees
- Dark patterns: No manipulative urgency, no hidden fees, no artificially difficult cancellation
- Misleading statistics: If XP totals or completion rates are displayed publicly, they must be accurate
- Fake social proof: No fabricated testimonials or manufactured review scores

---

## Part 8 — Compliance Framework

### 8.1 Education-First Compliance Principle

TecPey Academy operates as an educational institution, not a financial services provider. This distinction is fundamental to compliance:
- No investment advice
- No asset recommendations
- No price predictions
- Education about financial concepts, not financial guidance

This framing significantly reduces regulatory risk in all jurisdictions.

### 8.2 Per-Market Compliance Considerations

| Market | Key Compliance Consideration | TecPey Action |
|--------|------------------------------|-------------|
| Iran | Unclear crypto regulation | Education-only positioning; no exchange integration in Academy content |
| UAE | VARA regulation | Register with VARA for educational platform if required; comply with disclosure requirements |
| Saudi Arabia | Capital Market Authority; Islamic finance oversight | Islamic finance module; CMA disclosure |
| EU | MiCA, GDPR | GDPR-compliant data architecture; MiCA educational content disclosure |
| Indonesia | Bappebti regulation | Local compliance review before launch |

### 8.3 Data Residency

- Phase 1 (Iran): Data stored on Iran-accessible infrastructure
- Phase 2: Data residency strategy per jurisdiction (GDPR in EU; local requirements in UAE)
- Phase 3: Data localization architecture required at scale

---

*Document Version 1.0 — Phase 14*
