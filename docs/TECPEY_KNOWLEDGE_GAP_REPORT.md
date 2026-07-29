# TecPey OS — Knowledge Gap Report

**Date:** 2026-07-08  
**Purpose:** Product knowledge extraction and gap analysis based exclusively on existing documentation (README, TECPEY_MASTER_BLUEPRINT, DECISION_LOG, FINAL_IMPLEMENTATION_GATE, and other /docs/ files).  
**Scope:** Product knowledge, business knowledge, AI knowledge, user experience, long-term strategy, monetization, and product memory only. No evaluation of implementation, security, or code.

This report identifies what is known, what is missing, open questions, partially documented ideas, and where concepts belong for permanent documentation.

---

## 1. Executive Identity & Philosophy

**Known:**
- TecPey is a Digital Financial Education & Trading Operating System, not a crypto exchange with education attached.
- Core brand promise: "تک‌پی، نقطه امن ورود به بازار رمزارز".
- Education-first, trust before volume, behavioral improvement before transaction count, revenue follows trust.
- 12 permanent pillars defined at high level.
- Non-negotiable principles (no profit promises, privacy defaults, no dark patterns, Persian-first global design).

**Missing:**
- Detailed brand voice and tone guidelines for all surfaces (UI, AI responses, marketing, support).
- Explicit success metrics hierarchy with leading vs lagging indicators.
- How the "Operating System" metaphor translates into concrete user mental models and onboarding.

**Questions:**
- What is the precise definition of "graduation rate" across different user segments?
- How will the platform communicate its identity to prop firms vs individual learners vs institutions?

**Ideas partially documented:**
- 12 pillars listed, but inter-pillar data flows and shared services are only high-level.

**Ideas that should become permanent documents:**
- Brand Voice & Messaging Guide
- Success Metrics Framework

**Ideas that belong inside Blueprint:**
- Refined pillar interdependencies and data ownership.

**Ideas that belong inside Decision Log:**
- Any future change to the "Operating System" vs "Platform" framing.

**Ideas that deserve their own dedicated document:**
- Brand Voice & Messaging Guide

---

## 2. Trading Arena

**Known:**
- 100,000 USD virtual starting capital per opportunity.
- Exactly 3 total opportunities (initial + 2 recharges).
- Renewal/extension packages after exhausting opportunities.
- Monthly paid subscription access model.
- Must never maximize addictive behavior; risk awareness and behavioral improvement are primary.
- Connected to Academy, Mentor AI, Profile, Reputation, and future Prop/Funded paths.
- Future capabilities reserved: seasons, leagues, ELO-style rating, performance/discipline scores, drawdown control, prop qualification, advanced order types, scenario training, team competitions.

**Missing:**
- Exact mechanics for drawdown control, risk limits, and forced liquidation rules.
- How ELO-style rating, performance score, and discipline score are calculated and weighted.
- Season/league structure, qualification criteria, and tournament formats.
- How "prop-style qualification" actually works (what signals are sent to external firms, consent model, data sharing boundaries).
- Subscription tiers, pricing, and what exactly monthly access unlocks vs the 3 free opportunities.
- Renewal package pricing, limits, and anti-abuse rules.
- How Arena capital interacts with real Exchange accounts (if any graduated path exists).
- Detailed anti-gaming and anti-addiction controls.

**Questions:**
- What happens to a user's historical data and scores if they exhaust opportunities and do not renew?
- How does the system handle users who treat the Arena as a game despite the design intent?
- What are the precise success criteria for "prop qualification"?

**Ideas partially documented:**
- "Major business engine and retention engine" is stated but not modeled with concrete funnels or economics.

**Ideas that should become permanent documents:**
- Trading Arena Rules & Mechanics Specification
- Arena Scoring & Rating System
- Prop Qualification Pathway Specification
- Arena Monetization & Subscription Model

**Ideas that belong inside Blueprint:**
- Arena as first-class pillar with explicit capital rules and opportunity limits (already present at high level).

**Ideas that belong inside Decision Log:**
- Decision to use 100k virtual + 3 opportunities + renewal model (DEC-006 to DEC-009 exist at summary level).

**Ideas that deserve their own dedicated document:**
- Trading Arena Rules & Mechanics Specification
- Prop Qualification Pathway Specification

---

## 3. Mentor AI (Trading Intelligence Engine)

**Known:**
- Not a generic chatbot; it is the Trading Intelligence Engine.
- Must record and analyze every Arena trade and every real Exchange trade.
- Builds long-term behavioral memory.
- Analyzes entries, exits, risk/reward, position sizing, drawdown, overtrading, revenge trading, FOMO, discipline, emotional patterns, consistency, learning gaps, and improvement over time.
- Generates personalized feedback, journals, weekly/monthly reports, learning paths, exercises, and warnings.
- Connects Academy learning behavior with Arena and Exchange performance.
- Always explainable, ethical, risk-aware; no financial advice or profit guarantees.
- Must integrate with Trading DNA and reputation systems.
- Evolves toward part of a broader AI Operating System.

**Missing:**
- Exact data schema for long-term trading memory.
- How memory is summarized, forgotten, or privacy-protected over time.
- Specific analysis models or algorithms for detecting FOMO, revenge trading, etc.
- How weekly/monthly reports are structured and delivered.
- Integration points with Academy progress and certification.
- Cost control, rate limiting, and fallback behavior specific to Mentor AI.
- How "behavioral coaching" differs from pure educational coaching.

**Questions:**
- What is the retention and deletion policy for raw trade memory?
- How does Mentor AI handle conflicting signals between Arena behavior and real Exchange behavior?
- What is the exact consent model for using trade data in coaching?

**Ideas partially documented:**
- "Major retention and differentiation engine" is stated but not operationalized.

**Ideas that should become permanent documents:**
- Mentor AI Data Schema & Memory Model
- Mentor AI Analysis & Coaching Specification
- Mentor AI Privacy & Consent Framework

**Ideas that belong inside Blueprint:**
- Mentor AI as Trading Intelligence Engine with full Arena + Exchange visibility (already present).

**Ideas that belong inside Decision Log:**
- Decision that Mentor AI must monitor every trade (DEC-010, DEC-011, DEC-012 exist at summary level).

**Ideas that deserve their own dedicated document:**
- Mentor AI Data Schema & Memory Model
- Mentor AI Analysis & Coaching Specification

---

## 4. Trading DNA & Behavioral Intelligence

**Known:**
- 12-dimension behavioral competence framework.
- Built from learning events, quiz performance, simulator trades, journal entries, and community participation.
- Used for personalization, reputation, leaderboards (discipline-based, not P&L), and qualification.
- Primary competitive moat that compounds with engagement.

**Missing:**
- The exact 12 dimensions and their definitions.
- Precise scoring formulas, weighting, and normalization.
- How dimensions evolve over time and how improvement is measured.
- Data sources and signal quality rules for each dimension.
- How Trading DNA is exposed to users vs prop firms vs the user themselves.
- Integration with Mentor AI memory and Academy progress.

**Questions:**
- Are the 12 dimensions fixed forever, or can they evolve?
- How is data quality and manipulation prevented in behavioral scoring?

**Ideas partially documented:**
- "Behavioral data is the moat" is repeated but not modeled as a data product or competitive asset.

**Ideas that should become permanent documents:**
- Trading DNA Dimensions & Scoring Specification
- Behavioral Intelligence Data Model

**Ideas that belong inside Blueprint:**
- Trading DNA as strategic asset and primary reputation signal (DEC-013).

**Ideas that belong inside Decision Log:**
- Decision to prioritize behavioral improvement over volume (DEC-014).

**Ideas that deserve their own dedicated document:**
- Trading DNA Dimensions & Scoring Specification

---

## 5. Academy

**Known:**
- 7-term structured curriculum with mastery gating (80% threshold).
- Quizzes, certificates (QR-verifiable), spaced repetition, streak system.
- Free at entry level (permanent).
- Connects to Arena, Mentor AI, and reputation.
- XP, levels, badges, scholarships, and achievements exist as concepts.

**Missing:**
- Detailed term-by-term learning objectives and assessment rubrics.
- Exact spaced repetition algorithm implementation and scheduling rules.
- How certificates convey value to employers or prop firms.
- Scholarship criteria and administration in detail.
- How "professional track" (TCP/TCM) differs from the standard 7 terms.
- Content update and maintenance process.

**Questions:**
- What is the precise definition and measurement of "graduation rate"?
- How does the system handle students who complete terms but show poor behavioral scores?

**Ideas partially documented:**
- Reward system (XP, badges, scholarships) is partially specified but not fully integrated with Arena or reputation.

**Ideas that should become permanent documents:**
- Academy Curriculum & Assessment Rubrics
- Certificate Value Proposition & Verification Model

**Ideas that belong inside Blueprint:**
- Academy as primary entry point and permanent free tier.

**Ideas that belong inside Decision Log:**
- Decision to keep core Academy free (DEC-004).

**Ideas that deserve their own dedicated document:**
- Academy Curriculum & Assessment Rubrics

---

## 6. Organization Platform & Enterprise

**Known:**
- Exists as a pillar for companies, universities, and institutions.
- Supports education campaigns, employee programs, reporting, and analytics.
- White-label and multi-tenant are future (Phase 44+).
- License types and revenue models are outlined at high level.

**Missing:**
- Detailed feature set for organization admins (dashboards, cohort analytics, campaign management).
- How organizations enroll and manage students at scale.
- Data isolation, reporting, and compliance features specific to B2B.
- Sales, onboarding, and support model for enterprise customers.
- Integration with existing LMS or HR systems.

**Questions:**
- What data can organizations see about individual students, and what requires student consent?
- How are organization-level programs priced and billed?

**Ideas partially documented:**
- White-label architecture exists at high level; go-to-market and operational model are thin.

**Ideas that should become permanent documents:**
- Organization Platform Product Requirements
- Enterprise Sales & Onboarding Playbook

**Ideas that belong inside Blueprint:**
- Organization Platform as a distinct pillar.

**Ideas that belong inside Decision Log:**
- Decision to defer full multi-tenant until after core hardening (DEC-020).

**Ideas that deserve their own dedicated document:**
- Organization Platform Product Requirements

---

## 7. Financial Ecosystem

**Known:**
- Starts with Exchange + education.
- Future expansion into savings plans, investment clubs, compliant lending, escrow, etc. is architecturally reserved.
- Must respect regulatory and compliance constraints.

**Missing:**
- Concrete product definitions, user journeys, and risk models for any future financial products.
- How these products integrate with Arena capital vs real exchange balances.
- Compliance and licensing roadmap per jurisdiction.

**Questions:**
- Will future financial products be available only to graduated/qualified users?
- How will the platform prevent users from treating educational savings products as real investment vehicles?

**Ideas partially documented:**
- High-level reservation in Blueprint and FUTURE_MODULES; no detailed product specs.

**Ideas that should become permanent documents:**
- Future Financial Products Product Vision

**Ideas that belong inside Blueprint:**
- Financial Ecosystem as a pillar with regulatory caution.

**Ideas that belong inside Decision Log:**
- N/A — mostly future.

**Ideas that deserve their own dedicated document:**
- Future Financial Products Product Vision

---

## 8. Developer Platform & Marketplace

**Known:**
- Future APIs, SDKs, webhooks, OAuth, plugin marketplace.
- Marketplace has 17+ categories (AI, Mentor, Strategy, Indicators, Signals, Bots, Prompts, Templates, Plugins, Developer tools, APIs, Automation, Education, Premium Content, White-Label, Business Services, Certification).
- Revenue sharing, moderation, and compliance controls are mentioned at high level.
- Strict educational-only constraints on signals and certain bots.

**Missing:**
- API versioning, rate limits, and developer onboarding flow.
- Marketplace publishing workflow, review process, quality scoring, and dispute resolution.
- Exact revenue splits and payout mechanics.
- Plugin SDK capabilities and security model.
- How Marketplace AI performs moderation and ranking.

**Questions:**
- What is the approval and takedown process for marketplace items?
- How are developers onboarded and supported?

**Ideas partially documented:**
- Categories listed; operational and economic model is thin.

**Ideas that should become permanent documents:**
- Developer Platform API & SDK Specification
- Marketplace Operations & Moderation Playbook

**Ideas that belong inside Blueprint:**
- Marketplace and Developer Platform as future pillars.

**Ideas that belong inside Decision Log:**
- N/A at this stage.

**Ideas that deserve their own dedicated document:**
- Developer Platform API & SDK Specification
- Marketplace Operations & Moderation Playbook

---

## 9. AI C-Level System & Market Intelligence

**Known:**
- Planned internal agents: AI CTO, CPO, CMO, CRO, CISO, CFO, Compliance Officer, QA Director.
- Market Intelligence: news, social sentiment, chart assistance — educational and risk-aware only.
- Part of the broader AI Operating System with gateway, model router, memory, governance.

**Missing:**
- Specific responsibilities, decision rights, and escalation paths for each C-Level agent.
- How internal AI outputs are reviewed or overridden by humans.
- Data sources and models for Market Intelligence.
- How Market Intelligence is surfaced to users without creating advice liability.

**Questions:**
- Can internal AI agents take autonomous action, or are they advisory only?
- What is the audit and override process for AI-generated executive recommendations?

**Ideas partially documented:**
- Agent names and high-level purposes exist; operational model and governance are absent.

**Ideas that should become permanent documents:**
- AI C-Level Agents Roles & Governance
- Market Intelligence Product & Liability Specification

**Ideas that belong inside Blueprint:**
- AI C-Level System as a pillar.

**Ideas that belong inside Decision Log:**
- Decision to build internal AI executives for governance (DEC-019).

**Ideas that deserve their own dedicated document:**
- AI C-Level Agents Roles & Governance

---

## 10. Social Layer, Reputation, Gamification, Achievements, Career Path

**Known:**
- Privacy-first community with discipline leaderboards, peer journals, study groups.
- Trading DNA, scores, badges, certificates feed reputation.
- XP, levels, badges, scholarships, and achievements are defined in the Reward System.
- Connected to prop qualification and career outcomes.
- Everything defaults to private.

**Missing:**
- Exact scoring formulas for leaderboards and reputation.
- How badges and achievements are displayed, shared, and verified.
- Career path progression model (what constitutes "career readiness").
- How prop firms or employers consume reputation data (consent, export formats, verification).
- Anti-gaming and fairness mechanisms for social features.
- Long-term user journey from Academy graduate to professional trader or prop candidate.

**Questions:**
- What data is visible to other users vs organizations vs the public?
- How does the system handle reputation decay or rehabilitation?

**Ideas partially documented:**
- Reward system mechanics (XP, badges) are partially specified; integration with reputation and prop paths is not.

**Ideas that should become permanent documents:**
- Reputation & Social Scoring Specification
- Career & Prop Qualification Pathway
- Gamification & Achievement System Design

**Ideas that belong inside Blueprint:**
- Social & Reputation Layer as a pillar with privacy-first principle.

**Ideas that belong inside Decision Log:**
- Decision that reputation is behavioral, not financial (DEC-017).

**Ideas that deserve their own dedicated document:**
- Reputation & Social Scoring Specification
- Career & Prop Qualification Pathway

---

## 11. Monetization, Subscriptions, Rewards, Referrals, Sponsors, Certification

**Known:**
- Multiple revenue streams catalogued (exchange fees, VIP, certificates, Arena subscriptions, AI premium, white-label, marketplace, etc.).
- Arena has monthly subscription + renewal packages.
- Reward system uses XP, levels, badges, scholarships (merit-based).
- Revenue must follow trust and never compromise education.

**Missing:**
- Exact subscription tiers, pricing, and feature differentiation for Arena, AI Mentor, and other premium layers.
- Referral model mechanics, rewards, fraud prevention, and payout.
- Sponsor model (who can sponsor, what they get, compliance rules).
- Certificate premium vs basic value proposition and pricing.
- How rewards (badges, scholarships) translate into tangible economic value or access.
- Churn, retention, and lifetime value models tied to behavioral improvement.

**Questions:**
- What exactly does a monthly Arena subscription unlock beyond the 3 free opportunities?
- How are referral rewards funded and attributed across Academy vs Arena vs Exchange?

**Ideas partially documented:**
- High-level revenue registry exists; concrete product-level monetization flows and packaging are thin.

**Ideas that should become permanent documents:**
- Subscription & Packaging Model
- Referral, Sponsor & Partnership Economics
- Certification Value & Pricing Model

**Ideas that belong inside Blueprint:**
- Revenue follows trust principle.

**Ideas that belong inside Decision Log:**
- Multiple monetization decisions (DEC-004, DEC-009, etc.).

**Ideas that deserve their own dedicated document:**
- Subscription & Packaging Model
- Referral, Sponsor & Partnership Economics

---

## 12. User Journey, Growth Loops, Portfolio Tracking

**Known:**
- High-level journey: Visitor → Academy → Exam → Arena → Mentor evaluation → Reputation → Exchange → Advanced/Prop → Financial Ecosystem.
- Two equal paths on home (Exchange + Academy).
- Mobile sticky CTAs required.
- Safe wording everywhere.

**Missing:**
- Detailed state machine for user progression (what unlocks what).
- Portfolio tracking features across Arena and Exchange.
- Growth loops (how users invite others, how retention compounds, how reputation drives acquisition).
- Onboarding flows for different segments (individual vs organization vs prop candidate).
- Offboarding, data export, and account deletion experience.

**Questions:**
- At what point does a user get "qualified" for real Exchange features or prop pathways?
- How is portfolio view unified when users have both virtual and real positions?

**Ideas partially documented:**
- User journey is described at the pillar level but not as an operational flow with states and gates.

**Ideas that should become permanent documents:**
- User Journey & Progression Model
- Growth Loops & Retention Architecture
- Unified Portfolio & Position Tracking Vision

**Ideas that belong inside Blueprint:**
- Primary user journey (already present at high level).

**Ideas that belong inside Decision Log:**
- N/A — mostly execution details.

**Ideas that deserve their own dedicated document:**
- User Journey & Progression Model
- Growth Loops & Retention Architecture

---

## 13. International Expansion, Mobile, API, White-Label Strategy

**Known:**
- Persian-first, global by design.
- Future phases for Arabic/Dari, mobile app, developer platform, white-label.
- White-label supports custom branding, domains, AI personality, and compliance.
- Multi-tenant architecture is planned but deferred.

**Missing:**
- Concrete international rollout criteria and localization requirements.
- Mobile strategy (PWA vs native, offline capabilities, push notifications).
- API strategy (public vs partner vs internal, versioning, developer experience).
- White-label go-to-market, sales process, onboarding, and support model.
- Data residency and sovereignty requirements per market.

**Questions:**
- What is the minimum viable product for a white-label deployment?
- How will mobile and web experiences stay in parity?

**Ideas partially documented:**
- Future phases are listed; detailed strategies and success criteria are absent.

**Ideas that should become permanent documents:**
- International Expansion Playbook
- Mobile Strategy
- Public API & Developer Experience Vision
- White-Label Go-to-Market & Operations

**Ideas that belong inside Blueprint:**
- White-label and multi-tenant as future pillars.

**Ideas that belong inside Decision Log:**
- Decision to defer white-label (DEC-020).

**Ideas that deserve their own dedicated document:**
- International Expansion Playbook
- White-Label Go-to-Market & Operations

---

## Knowledge Still Living Outside Documentation

The following major concepts appear conceptually in vision, pillars, or high-level descriptions but lack sufficient permanent documentation:

- Exact 12 Trading DNA dimensions and scoring formulas
- Arena ELO, drawdown, qualification, and season mechanics
- Mentor AI memory schema, analysis models, and report templates
- Detailed user journey state machine and progression gates
- Prop/Funded account qualification criteria and data sharing model
- Subscription tiers, pricing, and packaging for Arena, AI, and other premium layers
- Referral, sponsor, and partnership economics and anti-fraud rules
- Organization Platform admin features, reporting, and enrollment flows
- Marketplace publishing workflow, moderation rules, and revenue splits
- AI C-Level agent responsibilities, decision rights, and human oversight model
- Growth loops (acquisition, retention, reputation-driven)
- Unified portfolio tracking across virtual and real positions
- International localization and market entry criteria
- Mobile experience strategy and parity requirements
- Public API surface, developer onboarding, and partner program
- White-label sales, onboarding, and operational model
- Certificate value proposition and employer/prop firm acceptance model
- Behavioral data retention, privacy, and consent framework
- Long-term user career path from Academy to professional trading
- Internal AI governance, audit, and override processes
- Content maintenance and curriculum update process
- Detailed anti-addiction and responsible design controls for Arena and AI

---

## Priority Classification

### Priority A — Must document immediately
- Trading Arena detailed rules, scoring, qualification, and monetization mechanics
- Mentor AI data schema, analysis models, memory model, and privacy framework
- Exact Trading DNA 12 dimensions and scoring formulas
- User journey state machine and progression gates
- Prop/Funded qualification pathway and data sharing model

### Priority B — Document before implementation
- Subscription & packaging model (Arena, AI, certificates, etc.)
- Organization Platform features and admin experience
- Marketplace operations, publishing workflow, moderation, and revenue splits
- AI C-Level agent roles, governance, and human oversight
- Referral, sponsor, and partnership mechanics
- Growth loops and retention architecture
- White-label go-to-market and operational model
- Unified portfolio tracking vision

### Priority C — Future documentation
- International expansion playbook
- Mobile strategy
- Public API & developer experience vision
- Detailed financial ecosystem product specs (when ready)
- Long-term content and curriculum maintenance process
- Advanced anti-addiction controls (as Arena evolves)

---

*This report is based solely on existing strategic documentation. It does not reflect implementation state.*