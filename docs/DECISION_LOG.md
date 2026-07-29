# TecPey OS — Decision Log

**Purpose:** This is the permanent executive decision registry for TecPey OS.  
It records the reasoning behind major strategic, architectural, and product decisions.  
It is **not** a changelog, not meeting notes, and not a roadmap.  
Every entry captures the "why" at the time the decision was made so that future teams and AI agents understand the constraints and intent.

**Rule:** New entries must be added only when a high-impact, difficult-to-reverse decision is made. Each entry must follow the exact template below.

---

# DEC-001

**Status:** Accepted

**Category:** Product Identity

**Date:** Unknown (Historical — pre-Phase 14)

**Decision**  
TecPey shall be positioned and architected as a Digital Financial Education & Trading Operating System, not merely a crypto exchange with an attached education section.

**Context**  
Early positioning described TecPey primarily as a Persian-language crypto trading platform with education. Multiple strategic documents (VISION v2, MASTER_BLUEPRINT series) evolved the identity.

**Problem**  
Treating the product as "exchange + education" creates misaligned incentives: volume and transaction count become primary success metrics. This risks optimizing for trading addiction rather than user competence and long-term safety.

**Alternatives Considered**  
- Pure exchange with optional education section  
- Education platform with optional trading features  
- Hybrid marketing that leads with exchange

**Why This Decision Was Chosen**  
The education-first thesis produces a defensible moat through behavioral data (Trading DNA). It aligns product decisions with user protection, regulatory resilience, and sustainable trust. Exchange becomes one pillar among many rather than the core.

**Trade-offs**  
Slower initial user acquisition via trading volume; higher requirement for high-quality educational content and behavioral systems; more complex positioning for investors.

**Long-term Impact**  
All pillars (Academy, Arena, Mentor AI, Reputation, etc.) are designed to feed behavioral improvement. Revenue models are subordinated to competence outcomes. This identity constrains future feature choices.

**Future Revisit Conditions**  
Only if regulatory classification or core thesis is fundamentally invalidated by market or legal changes.

**Related Documents**  
docs/TECPEY_MASTER_BLUEPRINT.md, docs/VISION_v2.md

**Related Product Pillars**  
All pillars — foundational identity decision.

---

# DEC-002

**Status:** Accepted

**Category:** Product Strategy

**Date:** Unknown (Historical)

**Decision**  
Education is the primary entry point and permanent free tier. All other capabilities (Arena, Exchange, advanced AI) are downstream of demonstrated learning.

**Context**  
Zero-price-barrier education was chosen as the acquisition engine instead of trading incentives or bonuses.

**Problem**  
Leading with trading or financial incentives attracts users who are unprepared and increases risk of loss, complaints, and regulatory exposure.

**Alternatives Considered**  
- Paid Academy from day one  
- Free trading credits to acquire users  
- Gamified trading-first onboarding

**Why This Decision Was Chosen**  
Free structured education builds trust and filters for users who are willing to learn. It creates the behavioral data moat before any capital is at risk. It is defensible against pure exchanges.

**Trade-offs**  
Lower short-term monetization from education; requires significant ongoing investment in curriculum quality.

**Long-term Impact**  
Academy becomes the on-ramp for Arena, Exchange, and enterprise use cases. Graduation and behavioral improvement become leading indicators.

**Future Revisit Conditions**  
If data shows that free entry creates unsustainable low-quality usage that harms reputation or compliance.

**Related Documents**  
docs/TECPEY_MASTER_BLUEPRINT.md (Academy section), REVENUE_MODEL.md

**Related Product Pillars**  
Academy, Mentor AI, Trading Arena, Organization Platform

---

# DEC-003

**Status:** Accepted

**Category:** Branding

**Date:** Unknown (Historical)

**Decision**  
The permanent brand promise is "تک‌پی، نقطه امن ورود به بازار رمزارز" (TecPey — Your Safe Entry Point to the Crypto Market).

**Context**  
Positioning language was chosen to emphasize safety, preparation, and responsibility rather than speed, profit, or ease.

**Problem**  
Most crypto platforms use language that implies or promises easy gains. This creates user expectations that lead to poor outcomes and platform liability.

**Alternatives Considered**  
- "Fastest way to trade crypto"  
- "Learn and earn"  
- "Your gateway to wealth"

**Why This Decision Was Chosen**  
The phrase directly communicates the education-first, risk-aware identity. It sets correct expectations from the first impression and aligns marketing with the actual product thesis.

**Trade-offs**  
May reduce appeal to pure speculative traders; requires consistent language discipline across all surfaces.

**Long-term Impact**  
Every UI string, marketing asset, and AI response must be consistent with "safe entry" framing. This reduces future regulatory and reputational risk.

**Future Revisit Conditions**  
Only if the core thesis itself changes.

**Related Documents**  
docs/TECPEY_MASTER_BLUEPRINT.md, README.md

**Related Product Pillars**  
All — brand identity

---

# DEC-004

**Status:** Accepted

**Category:** Monetization

**Date:** Unknown (Historical)

**Decision**  
The core Academy curriculum at entry level shall remain permanently free.

**Context**  
Decision to keep basic structured education accessible without payment barrier.

**Problem**  
Placing a price on foundational education would exclude the exact audience that most needs preparation before risking capital.

**Alternatives Considered**  
- Freemium with limited terms free  
- Paywall after Term 1 or Term 3  
- "Free trial" model

**Why This Decision Was Chosen**  
Free entry maximizes reach and trust. It creates the largest possible pool from which high-potential users self-select into paid Arena, certificates, and future services. It is a strategic acquisition asset.

**Trade-offs**  
Direct revenue from education is deferred; requires other monetization vectors (Arena subscriptions, certificates, enterprise, exchange).

**Long-term Impact**  
Academy functions as a public good and trust layer. Paid layers are always positioned as advanced or optional.

**Future Revisit Conditions**  
Only if sustainability data shows the free tier cannot be supported by downstream revenue.

**Related Documents**  
REVENUE_MODEL.md, TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
Academy, Organization Platform

---

# DEC-005

**Status:** Accepted

**Category:** Product Architecture

**Date:** Unknown (Historical)

**Decision**  
Trading Arena is a first-class strategic pillar, not a secondary demo or simulation feature.

**Context**  
The Arena was elevated from "simulator module" to a core pillar alongside Academy and Exchange.

**Problem**  
Treating simulation as a minor add-on fails to capture its role in behavioral data collection, skill development, reputation building, and qualification pathways.

**Alternatives Considered**  
- Small demo mode inside Academy  
- Separate "paper trading" section with limited integration

**Why This Decision Was Chosen**  
Arena generates the richest behavioral signals (risk decisions under pressure). It is the primary practice environment before real capital and a major retention and qualification engine.

**Trade-offs**  
Requires significant investment in realism, fairness, anti-gaming mechanics, and deep integration with Mentor AI and reputation systems.

**Long-term Impact**  
Arena becomes the bridge between learning and real trading. It feeds Trading DNA, Mentor memory, and future prop/funded paths.

**Future Revisit Conditions**  
If regulatory classification of simulation changes significantly.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md (Trading Arena section)

**Related Product Pillars**  
Trading Arena, Mentor AI, Academy, Social & Reputation, Exchange Core

---

# DEC-006

**Status:** Accepted

**Category:** Product Design

**Date:** Unknown (Historical)

**Decision**  
Trading Arena uses substantial virtual capital (treated as serious evaluation capital) rather than trivial demo amounts or unlimited paper money.

**Context**  
Choice of 100,000 USD virtual starting capital with real constraints.

**Problem**  
Tiny demo balances produce unrealistic behavior. Unlimited paper money removes all risk discipline.

**Alternatives Considered**  
- $1,000 or $10,000 starting capital  
- Unlimited virtual funds  
- Real-money micro accounts

**Why This Decision Was Chosen**  
100k creates realistic position sizing, drawdown, and risk/reward decisions that transfer to real trading. It forces users to treat capital with respect while remaining safe.

**Trade-offs**  
Users may initially feel the amount is "too much" or "not enough"; requires clear communication that it is evaluation capital only.

**Long-term Impact**  
Behavioral data collected is higher fidelity. Discipline and risk management scores become meaningful.

**Future Revisit Conditions**  
If user research shows the number itself distorts behavior in unintended ways.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
Trading Arena

---

# DEC-007

**Status:** Accepted

**Category:** Product Design

**Date:** Unknown (Historical)

**Decision**  
Every user receives exactly 100,000 USD virtual starting capital in the Arena.

**Context**  
Fixed starting capital for fairness and comparability.

**Problem**  
Variable starting amounts would make cross-user comparison and ranking meaningless.

**Alternatives Considered**  
- Tiered starting capital based on Academy performance  
- User-chosen starting amounts

**Why This Decision Was Chosen**  
Fixed capital creates a level playing field. All users are evaluated on the same base. It simplifies ranking, qualification, and behavioral scoring.

**Trade-offs**  
Less flexibility for advanced users who may want different risk profiles from the start.

**Long-term Impact**  
Enables clean leaderboards, ELO-style systems, and prop qualification based on skill rather than starting conditions.

**Future Revisit Conditions**  
If qualification programs require different capital tiers for different prop firm partners.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
Trading Arena, Social & Reputation

---

# DEC-008

**Status:** Accepted

**Category:** Product Design

**Date:** Unknown (Historical)

**Decision**  
Users receive exactly three total opportunities (initial + two recharges).

**Context**  
Hard limit on free evaluation capital resets.

**Problem**  
Unlimited resets remove consequences and turn the Arena into a video game rather than a serious practice environment.

**Alternatives Considered**  
- Unlimited recharges  
- One recharge only  
- Recharge based on Academy performance only

**Why This Decision Was Chosen**  
Three opportunities strike a balance between giving users room to learn from failure and maintaining real consequences. It mirrors real capital constraints.

**Trade-offs**  
Some users will feel three is too few; requires clear renewal path.

**Long-term Impact**  
Encourages deliberate practice rather than random experimentation. Creates natural demand for renewal packages.

**Future Revisit Conditions**  
If data shows the number creates excessive churn before users develop competence.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
Trading Arena

---

# DEC-009

**Status:** Accepted

**Category:** Monetization

**Date:** Unknown (Historical)

**Decision**  
After exhausting the three free opportunities, users may purchase renewal/extension packages.

**Context**  
Paid continuation after free capital is depleted.

**Problem**  
Completely blocking users after three losses creates frustration and high churn. Completely free continuation removes all skin in the game.

**Alternatives Considered**  
- No renewals (hard stop)  
- Free recharges based on Academy scores only

**Why This Decision Was Chosen**  
Renewals provide a fair path for motivated users while generating revenue from the most engaged segment. It respects the principle that serious practice has value.

**Trade-offs**  
Risk of perception that the platform "sells" more chances; must be clearly framed as evaluation capital, not guaranteed success.

**Long-term Impact**  
Arena becomes a recurring revenue engine while still enforcing discipline.

**Future Revisit Conditions**  
If renewal pricing or frequency begins to attract users who treat it as gambling.

**Related Documents**  
REVENUE_MODEL.md, TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
Trading Arena

---

# DEC-010

**Status:** Accepted

**Category:** AI Architecture

**Date:** Unknown (Historical)

**Decision**  
Mentor AI must record and analyze every trade executed in the Trading Arena.

**Context**  
Requirement for complete behavioral signal capture.

**Problem**  
If Arena trades are not fed to Mentor AI, the system cannot build accurate Trading DNA or provide relevant coaching.

**Alternatives Considered**  
- Optional opt-in tracking  
- Summary-only tracking

**Why This Decision Was Chosen**  
Full capture is required for the behavioral moat. Partial data produces weak models and low-value feedback.

**Trade-offs**  
Increases data volume and requires strong privacy controls.

**Long-term Impact**  
Mentor AI becomes the single source of truth for user trading behavior across practice and real environments.

**Future Revisit Conditions**  
Only if privacy regulations make full trade logging impossible.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md (Mentor AI section)

**Related Product Pillars**  
Mentor AI, Trading Arena

---

# DEC-011

**Status:** Accepted

**Category:** AI Architecture

**Date:** Unknown (Historical)

**Decision**  
Mentor AI must also monitor and incorporate trades executed on the real Exchange.

**Context**  
Unified view across simulated and real capital environments.

**Problem**  
Behavior in the Arena may differ significantly from behavior with real money. Separate systems would create fragmented user understanding.

**Alternatives Considered**  
- Arena-only analysis  
- Separate "real trading" coach

**Why This Decision Was Chosen**  
The goal is long-term behavioral improvement in real markets. Only by seeing both environments can Mentor AI detect gaps between practice and live behavior.

**Trade-offs**  
Higher integration complexity and stricter privacy/security requirements for real trading data.

**Long-term Impact**  
Mentor AI becomes a continuous companion across the entire user journey.

**Future Revisit Conditions**  
If regulatory separation of simulation and live trading data is required.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
Mentor AI, Exchange Core

---

# DEC-012

**Status:** Accepted

**Category:** AI Architecture

**Date:** Unknown (Historical)

**Decision**  
Mentor AI shall build and maintain long-term behavioral memory for each user rather than operating on session-only context.

**Context**  
Memory persistence across weeks, months, and years.

**Problem**  
Session-only AI produces generic advice and cannot track improvement or recurring patterns.

**Alternatives Considered**  
- Stateless chat only  
- Short-term (last 7 days) memory

**Why This Decision Was Chosen**  
Long-term memory is required to measure behavioral change, which is the core success metric. It also enables increasingly personalized and relevant coaching.

**Trade-offs**  
Storage cost, privacy obligations, and need for memory summarization / forgetting policies.

**Long-term Impact**  
Mentor AI becomes a longitudinal coach rather than a one-off assistant.

**Future Revisit Conditions**  
If retention policies or data minimization rules require aggressive pruning.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md, MENTOR_AI_MODEL.md

**Related Product Pillars**  
Mentor AI

---

# DEC-013

**Status:** Accepted

**Category:** Product Strategy

**Date:** Unknown (Historical)

**Decision**  
Trading DNA (12-dimension behavioral competence framework) is treated as a core strategic asset and primary reputation signal.

**Context**  
Decision to measure and surface discipline, risk management, consistency, etc., instead of P&L.

**Problem**  
Traditional leaderboards based on profit encourage reckless behavior and do not predict long-term success.

**Alternatives Considered**  
- P&L-based rankings  
- Win-rate only  
- Volume-based metrics

**Why This Decision Was Chosen**  
Behavioral dimensions are more predictive of sustainable trading success and transferable to professional contexts (prop firms, institutions). They also align with the education mission.

**Trade-offs**  
Less immediately exciting for users who want to see "who made the most money."

**Long-term Impact**  
Reputation, qualification, and matching systems are built on competence rather than luck or aggression.

**Future Revisit Conditions**  
Only if empirical data shows the 12 dimensions have no predictive value.

**Related Documents**  
TRADING_DNA_MODEL.md, TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
Social & Reputation, Trading Arena, Mentor AI

---

# DEC-014

**Status:** Accepted

**Category:** Success Metrics

**Date:** Unknown (Historical)

**Decision**  
Behavioral improvement and graduation rate are higher-priority success metrics than transaction volume or active traders.

**Context**  
Explicit ordering of outcome metrics.

**Problem**  
Volume-based metrics reward platforms that maximize trading activity, including harmful activity.

**Alternatives Considered**  
- Primary metrics: trading volume, MAU, revenue  
- Balanced scorecard with volume as co-equal

**Why This Decision Was Chosen**  
The mission is to produce safer, more competent market participants. If volume increases as a side effect of competence, that is acceptable. If volume increases at the expense of competence, that is failure.

**Trade-offs**  
May appear slower-growing to investors focused on traditional exchange metrics.

**Long-term Impact**  
Product, AI, and Arena design are optimized for learning loops rather than engagement loops.

**Future Revisit Conditions**  
If business sustainability requires rebalancing before the model is proven.

**Related Documents**  
VISION_v2.md, TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
All

---

# DEC-015

**Status:** Accepted

**Category:** AI Ethics

**Date:** Unknown (Historical)

**Decision**  
AI systems must assist users in improving discipline and risk awareness; they must never be designed to increase trading frequency or encourage higher risk-taking.

**Context**  
Explicit constraint on AI objective functions.

**Problem**  
Many trading platforms optimize AI and UX for engagement, which in trading contexts often means more trades and higher risk.

**Alternatives Considered**  
- Neutral "maximize user satisfaction"  
- "Help users make profitable decisions"

**Why This Decision Was Chosen**  
The thesis is that most users are overconfident and underprepared. Helping them trade more is likely to increase harm. The platform's responsibility is to improve judgment, not activity.

**Trade-offs**  
May reduce short-term engagement metrics.

**Long-term Impact**  
AI prompts, reward systems, and feedback loops are written with risk reduction and behavioral improvement as primary goals.

**Future Revisit Conditions**  
If data clearly shows that certain users benefit from higher activity under controlled conditions.

**Related Documents**  
AI_PLATFORM.md, TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
Mentor AI, AI Market Intelligence, AI C-Level

---

# DEC-016

**Status:** Accepted

**Category:** Identity Architecture

**Date:** Unknown (Historical)

**Decision**  
A user has one identity across Academy, Trading Arena, and Exchange.

**Context**  
Unified user model rather than separate accounts for education and trading.

**Problem**  
Separate identities fragment behavioral data and prevent the platform from seeing the whole user journey.

**Alternatives Considered**  
- Separate Academy and Exchange accounts  
- Optional linking

**Why This Decision Was Chosen**  
The value of the system comes from connecting learning behavior, practice behavior, and real trading behavior. One identity enables the full data moat and coherent user experience.

**Trade-offs**  
Higher security and privacy requirements; more complex account model.

**Long-term Impact**  
All future features (reputation, prop qualification, enterprise reporting) assume a single longitudinal user record.

**Future Revisit Conditions**  
If regulatory requirements force separation of education and trading identities.

**Related Documents**  
MASTER_BLUEPRINT_v3.md (Identity section)

**Related Product Pillars**  
All

---

# DEC-017

**Status:** Accepted

**Category:** Reputation

**Date:** Unknown (Historical)

**Decision**  
Social reputation and leaderboards are based on learning outcomes and behavioral discipline, not financial results.

**Context**  
Explicit exclusion of P&L from public reputation signals.

**Problem**  
Profit-based reputation rewards luck and risk-taking while punishing prudent behavior.

**Alternatives Considered**  
- Hybrid (some weight on returns)  
- Public P&L with disclaimers

**Why This Decision Was Chosen**  
The platform's claim is that it produces better decision-makers. Reputation must therefore reflect decision quality and consistency, not outcome variance.

**Trade-offs**  
Less viral "who is winning" appeal.

**Long-term Impact**  
Leaderboards, badges, and community status become meaningful signals for prop firms and employers.

**Future Revisit Conditions**  
If partner prop firms demand some return-based component for qualification.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
Social & Reputation, Trading Arena

---

# DEC-018

**Status:** Accepted

**Category:** Product Strategy

**Date:** Unknown (Historical)

**Decision**  
An Organization / Business Platform pillar shall exist for companies, universities, and institutions to run education and evaluation programs at scale.

**Context**  
B2B layer on top of the individual product.

**Problem**  
Individual-only product limits total addressable market and prevents large-scale deployments (employee education, university programs, prop firm training).

**Alternatives Considered**  
- Only individual accounts  
- Simple "group discount" model without dedicated tools

**Why This Decision Was Chosen**  
Institutions represent both a large revenue opportunity and a high-trust distribution channel. They also generate dense behavioral datasets.

**Trade-offs**  
Requires multi-tenant architecture, reporting, and admin tooling that individual users do not need.

**Long-term Impact**  
Organization Platform becomes a major enterprise revenue vector and a source of high-quality training data.

**Future Revisit Conditions**  
If compliance or data residency requirements make institutional use impractical.

**Related Documents**  
WHITE_LABEL_PLATFORM.md, TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
Organization Platform, Multi-Tenant / White-Label

---

# DEC-019

**Status:** Accepted

**Category:** AI Architecture

**Date:** Unknown (Historical)

**Decision**  
Internal AI C-Level / Executive agents (AI CTO, CPO, CMO, CRO, etc.) shall be part of the long-term architecture.

**Context**  
Planned internal intelligence layer for governance and operations.

**Problem**  
As the platform grows, human executives will need scalable, consistent, high-context analysis and recommendation support.

**Alternatives Considered**  
- Only external user-facing AI  
- Ad-hoc analytics tools for internal teams

**Why This Decision Was Chosen**  
Internal agents can maintain institutional memory, apply consistent risk and product frameworks, and surface issues faster than manual review. They are a force multiplier for a small team.

**Trade-offs**  
Risk of over-reliance on internal AI; requires strong governance and auditability.

**Long-term Impact**  
AI becomes part of the operating system for the company itself, not only for users.

**Future Revisit Conditions**  
If internal AI creates liability or decision-quality problems.

**Related Documents**  
AI_PLATFORM.md, TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
AI C-Level / Executive AI System, Admin OS

---

# DEC-020

**Status:** Accepted

**Category:** Architecture

**Date:** Unknown (Historical)

**Decision**  
White-Label and full Multi-Tenant capabilities are deliberately deferred to later phases (Phase 44+).

**Context**  
Decision to sequence tenant isolation after core security and persistence.

**Problem**  
Building multi-tenant features before the single-tenant system is secure, observable, and data-durable creates high risk of systemic issues.

**Alternatives Considered**  
- Multi-tenant from the beginning  
- Early white-label for a few partners

**Why This Decision Was Chosen**  
Tenant isolation, billing, and branding are complex. They amplify every existing weakness in auth, data model, and operations. Core must be solid first.

**Trade-offs**  
Delays enterprise revenue; requires discipline to say no to early B2B opportunities that would force premature architecture.

**Long-term Impact**  
When white-label launches, the foundation is already production-hardened.

**Future Revisit Conditions**  
Only if a high-value enterprise opportunity justifies accelerating the work with appropriate risk acceptance.

**Related Documents**  
MASTER_BLUEPRINT_v3.md, WHITE_LABEL_PLATFORM.md

**Related Product Pillars**  
Multi-Tenant / White-Label Infrastructure

---

# DEC-021

**Status:** Accepted

**Category:** Program Management

**Date:** Phase 39.5 (2026-07)

**Decision**  
Security hardening, observability, persistence, and test infrastructure must be completed before any significant new feature expansion.

**Context**  
Explicit program-level sequencing decision after Phase 39.5 governance work.

**Problem**  
Continuing to add features on top of known P0 security gaps, localStorage data stores, and missing test coverage increases both technical debt and launch risk.

**Alternatives Considered**  
- Parallel feature development while hardening  
- "Soft launch now, fix later"

**Why This Decision Was Chosen**  
The platform already has broad surface area. Additional features without foundation increase the cost and risk of future remediation. Hardening now is cheaper and safer.

**Trade-offs**  
Short-term perception of slower progress; potential loss of momentum.

**Long-term Impact**  
Future features are built on a trustworthy base. Launch risk is materially reduced.

**Future Revisit Conditions**  
Only if business survival requires immediate revenue features (not currently the case).

**Related Documents**  
LAUNCH_READINESS_REPORT.md, SECURITY_BLOCKERS.md, TECPEY_MASTER_BLUEPRINT.md

**Related Product Pillars**  
All (foundational constraint)

---

# DEC-022

**Status:** Accepted

**Category:** Engineering Culture

**Date:** Unknown (Historical)

**Decision**  
Documentation is treated with the same rigor as source code (versioned, reviewed, and considered part of the product).

**Context**  
Strategic documents (Blueprint, Decision Log, etc.) are maintained as first-class artifacts.

**Problem**  
In many organizations, product and architecture decisions are lost in Slack, Notion pages, or people's heads. New team members and AI agents have no reliable source of truth.

**Alternatives Considered**  
- "Documentation is nice to have"  
- Living docs in code comments only

**Why This Decision Was Chosen**  
The complexity and long time horizon of TecPey OS require institutional memory. High-quality documentation reduces onboarding cost, prevents repeated debates, and constrains future AI agents.

**Trade-offs**  
Requires ongoing maintenance effort.

**Long-term Impact**  
The project can survive team changes and can be handed to new engineers or AI systems with context.

**Future Revisit Conditions**  
Never — this is a permanent operating principle.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md, this Decision Log

**Related Product Pillars**  
All

---

# DEC-023

**Status:** Accepted

**Category:** Governance

**Date:** Phase 39.5

**Decision**  
docs/TECPEY_MASTER_BLUEPRINT.md is designated the single source of truth for TecPey OS vision, pillars, and constraints.

**Context**  
After multiple vision and blueprint iterations, one document was elevated.

**Problem**  
Scattered documents (VISION_v2, PLATFORM_BLUEPRINT_v2, various phase plans) created conflicting or outdated guidance.

**Alternatives Considered**  
- Keep multiple "equally valid" vision documents  
- Let code be the only truth

**Why This Decision Was Chosen**  
A single, maintained blueprint allows consistent decision-making across human teams and AI agents. It explicitly records what must not be forgotten and what must not be built yet.

**Trade-offs**  
Requires active maintenance when strategy genuinely changes.

**Long-term Impact**  
All future work is expected to reference or align with the Master Blueprint.

**Future Revisit Conditions**  
Only when a deliberate, documented strategy shift occurs.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md (self-reference)

**Related Product Pillars**  
All

---

# DEC-024

**Status:** Accepted

**Category:** AI Governance

**Date:** Phase 39.5

**Decision**  
Every future AI agent working on TecPey must read the Master Blueprint before proposing or implementing changes.

**Context**  
Explicit instruction to all AI systems (Claude, future agents, etc.).

**Problem**  
Without this rule, AI agents perform broad repository scans, re-audit everything, ignore strategic constraints, and propose work that contradicts the education-first thesis or known hardening priorities.

**Alternatives Considered**  
- "AI can figure it out from code and recent context"  
- Optional reading

**Why This Decision Was Chosen**  
The blueprint encodes non-obvious, high-impact constraints (Trading Arena capital rules, Mentor AI responsibilities, no profit promises, security-before-features, etc.). Token-efficient, correct work is impossible without it.

**Trade-offs**  
Slightly higher context cost at the beginning of each session.

**Long-term Impact**  
Future development stays aligned with the original strategic intent even as team and AI participants change.

**Future Revisit Conditions**  
Only if the blueprint itself is superseded by a new version with clear migration notes.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md (Permanent Instruction section)

**Related Product Pillars**  
All

---

# DEC-025

**Status:** Accepted

**Category:** Engineering Discipline

**Date:** Phase 39.5

**Decision**  
Token efficiency is a first-class engineering requirement for all AI-assisted work on TecPey.

**Context**  
Rule that AI agents must avoid unnecessary broad scans, re-audits, and verbose output unless explicitly requested.

**Problem**  
Unconstrained AI usage burns tokens, slows sessions, and often produces low-signal output that still requires human filtering.

**Alternatives Considered**  
- "Use as many tokens as needed for thoroughness"  
- No guidance

**Why This Decision Was Chosen**  
High-quality strategic and architectural work can be done with targeted reads and focused reasoning. Broad re-audits are rarely necessary once the Master Blueprint and Decision Log exist. Efficiency preserves budget and attention.

**Trade-offs**  
Requires discipline from both the AI and the human prompting it.

**Long-term Impact**  
Development velocity remains high while cost and noise stay controlled.

**Future Revisit Conditions**  
If model costs drop dramatically or new requirements emerge that justify broader analysis.

**Related Documents**  
TECPEY_MASTER_BLUEPRINT.md (Token-Efficiency Rules)

**Related Product Pillars**  
All

---

## Principles That Must Never Change

These principles define the permanent identity of TecPey. They are not tactics and should not be revisited lightly.

1. TecPey is a Digital Financial Education & Trading Operating System.
2. The brand promise "تک‌پی، نقطه امن ورود به بازار رمزارز" is permanent.
3. Education-first is the primary thesis; revenue follows trust.
4. The core Academy entry level remains permanently free.
5. Trading Arena is a strategic pillar with real evaluation stakes (virtual capital).
6. Users receive a limited number of Arena opportunities (currently three) plus paid renewals.
7. Mentor AI is the Trading Intelligence Engine and must see both Arena and Exchange activity.
8. Long-term behavioral memory and Trading DNA are core strategic assets.
9. Behavioral improvement and graduation rate outrank transaction volume as success metrics.
10. AI exists to improve user judgment and discipline, never to increase trading volume or risk-taking.
11. P&L, win rate, and profit are never primary reputation or leaderboard signals.
12. A single user identity spans Academy, Arena, and Exchange.
13. Social reputation is based on learning and discipline, not financial outcomes.
14. Security, data durability, and compliance are non-negotiable foundations.
15. Documentation (especially the Master Blueprint) is treated as source code and single source of truth.
16. Hardening and infrastructure must precede major feature expansion.
17. White-label and multi-tenant are future phases, not early priorities.
18. AI agents working on TecPey must read the Master Blueprint before acting.
19. Token efficiency is a required discipline.
20. No profit guarantees, no dark patterns, no manipulation of user behavior.
21. Persian-first, global by design (RTL/LTR parity is permanent).
22. Everything defaults to private; sharing requires explicit opt-in.
23. The platform must degrade gracefully when AI or other components are unavailable.
24. User behavioral data is used to help the user, not to exploit or sell.
25. The long-term measure of success is competent, safer market participants — not platform volume or short-term revenue.

These principles are expected to survive team changes, funding events, and major product expansions. Any proposal that contradicts them must explicitly justify why the principle itself should be changed.

---

*End of DECISION_LOG.md*  
This document is intended to be append-only for new high-impact decisions and should be referenced by all future AI agents and human contributors.